# Recipe Graph Backend: How It Fits Together

Status as of 2026-11-16: the account-backed backend (Epics 1 and 2, FR-13 to FR-21) is implemented and verified. This is the single
engineering report for it. Product scope stays in `docs/prd.md` and `docs/addendum.md`; setup and operations stay in `README.md`.
Client request/response shapes and error codes are in `docs/api-contract.md`. Requirements and stories are in
`_bmad-output/archive/account-backed-backend/epics.md`, and the original spec is `_bmad-output/archive/account-backed-backend/SPEC.md` (archived: implemented).

## 1. Layers and request flow

```
HTTP request
  -> app.ts createApiApp()          JSON body limit 16kb, /health, per-IP rate limit on /api, error handler
  -> interface/http/api-router.ts   createApiRouter() mounts the four routers
  -> interface/http/routes/*        parse input (Zod), authenticate, map errors to HTTP
  -> application/services/*         business rules, hashing, token and code generation
  -> core/*                         contracts (repository interfaces, error classes, cursor, types)
  -> infrastructure/*               Neo4j repositories, Argon2, Resend or SMTP mailer, Google verifier
```

Rule from `AGENTS.md`: routes never touch Neo4j or providers. They call services, services call core ports, and adapters implement the
ports. Everything is wired once in `api/src/index.ts` `main()`:

1. `environmentSchema` (Zod) validates env vars, including `VERIFICATION_CODE_SECRET` (at least 32 chars) and email provider settings.
2. It builds the Neo4j driver, then `Neo4jIngredientsRepository`, `Neo4jRecipesRepository` and `Neo4jAccountsRepository`.
3. It builds `AccountsService` from the accounts repository, `Argon2PasswordHasher`, `createVerificationMailer(env)`,
   `createGoogleIdentityVerifier(env)` (undefined when Google is not configured), and delivery-failure loggers.
4. `accountsRepository.assertReady()` runs before listening. It also backs `/health`.
5. `createApiApp(...)` is called, then `listen`, with SIGINT/SIGTERM closing the server and driver.

## 2. Public recipe features (existing, unchanged contracts)

| Route | Handler path | What happens |
|---|---|---|
| `GET /api/ingredients` | `IngredientsService.getIngredientNames` | Canonical vocabulary from Neo4j |
| `POST /api/ingredients/parse` | `IngredientsService.parse` -> `parseIngredientText` | Loads names, aliases and categories, then deterministic exact and one-edit typo matching. No LLM. |
| `GET /api/filters` | `IngredientsService.getIngredientCategories` and `RecipesService.getCuisineNames` | Filter vocabulary |
| `POST /api/recipes/search` | `RecipesService.search` -> `Neo4jRecipesRepository.search` | Rejects unknown cuisines (`InvalidRecipeCuisineError`); ranking with cursor pagination via `encodeRecipeSearchCursor`, `decodeRecipeSearchCursor` and `recipeSearchFingerprint` |
| `GET /api/recipes/:id` | `RecipesService.getRecipeDetail` -> `Neo4jRecipesRepository.getRecipeDetail` | Detail plus identity-free ratings: `individual` values (1-5) and `aggregate` |

Rating aggregation (`recipes.queries.ts`, `RECIPE_DETAIL_QUERY`): every `(Recipe)-[:HAS_RATING]->(Rating)` with `value > 0` is pooled,
whether it came from the source dataset or a user. The aggregate is `avg(value)`, which weights by count. When a recipe has no
individual ratings, it falls back to the stored `recipe.aggregateRating`. No rater identity is ever read.

## 3. Account features

### 3.1 Route table (`interface/http/routes/accounts.routes.ts`, `createAccountsRouter`)

Auth means `Authorization: Bearer <accessToken>`, enforced by `requireAuthenticatedAccount(request, service)`. It returns
`401 UNAUTHENTICATED` when the header is missing or empty and `401 SESSION_EXPIRED` when the token is invalid. `sensitiveAttemptLimit`
allows 10 requests per 15 minutes on the routes marked below.

| Route | Auth | Service call | Purpose |
|---|---|---|---|
| `POST /accounts/register` | no | `register` | Create unverified password account and send 8-digit code |
| `POST /accounts/verify` | no | `verify` | Consume code, mark verified |
| `POST /accounts/resend-verification` | no | `resendVerification` | New code, old one invalidated |
| `POST /accounts/sign-in` | no, limited | `signIn` | Verified password account -> device session |
| `POST /accounts/google` | no, limited | `googleSignIn` | Verified Google ID token -> session, or create account |
| `POST /accounts/recover` | no | `requestRecovery` | Always the same accepted response |
| `POST /accounts/reset-password` | no, limited | `resetPassword` | Code + new password; revokes all sessions |
| `POST /accounts/sessions/refresh` | refresh token in body | `refreshSession` | Rotate tokens |
| `GET /accounts/sessions` | yes | `listSessions` | Active sessions with device name and last-used time |
| `POST /accounts/sign-out`, `DELETE /accounts/sessions/current` | yes | `signOut` (current session) | End this device |
| `DELETE /accounts/sessions/:sessionId` | yes | `signOut` (with target session id) | End another device |
| `GET /accounts/me` | yes | `getProfile` | Email and username only |
| `GET`, `POST /accounts/favorites`, `DELETE /accounts/favorites/:recipeId` | yes | `listFavorites`, `addFavorite`, `removeFavorite` | My Recipes |
| `GET /accounts/ratings/:recipeId`, `POST /accounts/ratings`, `DELETE /accounts/ratings/:recipeId` | yes | `getMyRating`, `setRating`, `removeRating` | The caller's own 1-5 rating |
| `DELETE /accounts/me` | yes, body `{confirm:true}` | `deleteAccount` | Terminal account deletion |

`reportPublicError()` maps core errors to HTTP: `SessionExpiredError` 401, `AccountAlreadyExistsError` 409,
`AccountMethodConflictError` 409, `RecipeNotFoundError` 404, `InvalidGoogleUsernameError` 400, `InvalidVerificationCodeError` 400,
Google unavailable or provider errors 503, `VerificationEmailDeliveryError` 503. Anything else goes to `apiErrorHandler`.

### 3.2 `AccountsService` (`application/services/accounts.service.ts`)

Helpers: `hashVerificationCode`, `hashRecoveryCode` and `hashSourceIp` (HMAC-SHA256 with `VERIFICATION_CODE_SECRET`; the purpose is
bound into the hash), `createVerificationCode` (8 digits via `randomInt`), `createOpaqueToken` (32 random bytes, base64url),
`normalizeEmail`, `normalizeUsername`, `isAuthoritativeGoogleEmail` (gmail.com, or domain equal to the hosted-domain claim).

| Method | Behavior |
|---|---|
| `register(input, sourceIp)` | Argon2id hash, then repository `register` (atomic uniqueness plus rate buckets: 3 per account and 10 per IP per rolling hour). Email is sent only if the result is `created`; a send failure raises `VerificationEmailDeliveryError`. |
| `verify(email, code)` | Hashes code, repository `verify`; false -> `InvalidVerificationCodeError` |
| `resendVerification(email, sourceIp)` | Repository `resendVerification` (supersedes the old code), then mail |
| `signIn(input)` | Lookup; Google-only account -> `AccountMethodConflictError('google')`; unverified or wrong password -> `null` (same public response); otherwise `issueSession` with `expectedPasswordHash` so a password reset racing the sign-in cannot yield a session |
| `authenticateAccessToken(token)` | Repository `validateAccessToken` -> claim `{accountId, sessionId, accessTokenHash}` or `null` |
| `refreshSession(refreshToken)` | Rotation and replay detection in the repository |
| `getProfile`, `listSessions` | Read with claim re-verification inside the repository transaction |
| `signOut(accountId, currentSessionId, accessTokenHash, targetSessionId?)` | Ends the current session, or another one of the same account, via repository `revokeSession` |
| `requestRecovery(email, sourceIp)` | Repository issues challenge; mail is sent asynchronously (`deliverRecoveryEmail`) so timing does not reveal account existence; failures are logged via `onRecoveryDeliveryFailure` |
| `resetPassword(input)` | Policy check, Argon2 hash, repository `resetPassword` (replace hash, consume code, revoke sessions in one transaction) |
| `googleSignIn(input)` | Verifier checks the ID token; look up by Google subject; existing -> session; new -> username required, conflict checks, `createGoogleAccount` (verification email only for non-authoritative addresses), then session. A unique-constraint race re-reads the winner. |
| `addFavorite`, `removeFavorite`, `listFavorites` | Repository calls bound to the caller's session claim |
| `setRating`, `getMyRating`, `removeRating` | `setRating` requires an integer 1-5; repository upserts one rating per account and recipe; `getMyRating` returns the caller's value or null |
| `deleteAccount` | Repository deletes account, sessions, favorites, challenges and Google identity, and detaches ratings |

### 3.3 Neo4j adapter (`Neo4jAccountsRepository`, implements `AccountsRepository`)

`register`, `resendVerification`, `verify`, `getPasswordAccountForSignIn`, `issueSession`, `validateAccessToken`, `getProfile`,
`listSessions`, `refreshSession`, `revokeSession`, `requestRecovery`, `resetPassword`, `getGoogleAccount`, `createGoogleAccount`,
`addFavorite`, `removeFavorite`, `listFavorites`, `setRating`, `removeRating`, `getRating`, `deleteAccount`, `assertReady`.

Design points verified by tests:
- Every protected read or write re-checks account and session state inside the same managed transaction (access-token hash plus an
  account/session lock), so revocation cannot race a mutation.
- Access validation updates `lastUsedAt` only. Only a successful refresh extends the 30-day idle window.
- Refresh tokens and access tokens are stored only as hashes. Rotated refresh hashes are kept so reuse ends the session.
- Verification and recovery challenges allow five failed attempts, are single-use, and only one per account and purpose is active.
- Ratings are `Rating` nodes linked to the recipe. The owner link is removed on account deletion and the value stays.
- `account-schema.ts`: `migrateAccountSchema` (run by `npm run migrate:accounts` and the Compose `account-migration` service) and
  `assertAccountSchemaReady`. Both first require the graph-level recipe import marker (`RecipeGraphMetadata {key:'recipe-import',
  completed:true}`), recipes, ingredients and `USES` links, then create or verify the unique constraints on `Account.id`, `emailNormalized`,
  `usernameNormalized`, challenges, `AccountSession.id`, `GoogleIdentity.subject`, `Rating.id` and `AccountRateLimit.key`.

### 3.4 Other infrastructure adapters

- `Argon2PasswordHasher` (`hash`, `verify`, with `HashConcurrencyLimiter` bounding parallel hashes).
- `createVerificationMailer(env)` in `email-config.ts` chooses `SmtpVerificationMailer` (local Mailpit) or `ResendVerificationMailer` (demo).
- `GoogleIdentityVerifier` and `createGoogleIdentityVerifier(env)` use `google-auth-library` pinned to the Node 20-compatible 10.5 line.
  Invalid tokens return null and transport errors become 503 without echoing token text. It is disabled unless `GOOGLE_CLIENT_ID(S)` is set.

## 4. Data and operations

- Data pipeline (`scripts/`): `download_dataset.py` -> `prepare-data.ts` (strips contributor and rater identities, writes
  `ratings.csv` with anonymous 1-5 values) -> `import-data.ts` (guarded import that writes the recipe-import marker) ->
  `migrate-account-schema.ts`. `compose-import.sh` and `demo-*.sh` wrap these for Compose and the demo.
- Local stack: `docker-compose.yml` (neo4j, mailpit, importer, account-migration, api, caddy). Demo stack: `docker-compose.demo.yml`
  with Resend; AWS provisioning in `infra/` stays behind the README review and operator approval.

## 5. Verification (2026-11-16)

- `npm run check`: lint clean, typecheck clean, 211 tests passed, 3 graph suites skipped for lack of their own configs.
- `tests/accounts-neo4j.integration.test.ts`: passed against a disposable Neo4j 5.26 container (seeded minimal recipe graph,
  no volume, removed afterwards). This confirmed the previously unverified stale-password session guard and the transactional lifecycle.
  The developer's real local graph volumes were not touched.
- The importer and recipe-search graph suites (`import-data.integration`, `recipe-search.neo4j.integration`) were not run: they are
  unrelated to this change and need their own configuration.
- Not done here: a live public-demo run (policy: synthetic disposable accounts only) and an end-to-end Google token test (needs a real
  client ID).

## 6. Decisions and accepted limits

- Android runs in parallel against the API contracts above (PRD and addendum supersede the SPEC's older "backend first" wording).
- Accepted for demo scope: no dummy-hash timing mitigation on sign-in; rotated refresh-hash history is not pruned; recovery email has
  no durable outbox; rate limiting is in memory (valid while the API runs as a single container).
- Explicit method conflicts are returned, so an email's registered method is disclosed, as registration already discloses duplicates.

## 7. Open items (need a human)

1. Confirm dataset attribution terms for public API serving and the wording and placement before any external distribution.
2. Record a reproducible provenance (snapshot id and script) for the source-rating audit counts in the SPEC companion.
3. Android client: the backend contract is complete (`docs/api-contract.md`); see `docs/addendum.md` for the integration handoff and the
   remaining Android decisions (Figma file, minimum Android version, attribution text).
