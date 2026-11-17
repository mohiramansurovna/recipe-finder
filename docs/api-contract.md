# Recipe Graph API Contract (for clients)

Client-facing reference for the Android app and any other first-party consumer. It is derived from the route and schema code under
`api/src/interface/http/`; if they disagree, the code and its tests win. For internal structure see `docs/backend-overview.md`.

## Conventions

- **Base URL:** local Compose `http://localhost:8080` (Android emulator: `http://10.0.2.2:8080`); all routes below are under `/api`.
  `GET /health` (outside `/api`) returns `{"status":"ok"}` or `503 {"status":"error"}`.
- **Format:** JSON requests and responses, body at most 16 KB. Request bodies are strict: unknown fields are rejected with `400 INVALID_REQUEST`.
  `DELETE /api/accounts/me` requires a JSON body, so the HTTP client must be able to send a body with DELETE.
- **Errors:** every failure is `{"error":{"code":"<CODE>","message":"<text>"}}`. Branch on `code`, not `message`.
- **Rate limits:** 100 requests per minute per source IP on `/api`; sign-in, Google sign-in and reset-password additionally allow
  10 requests per 15 minutes per IP. Exceeding either returns `429 RATE_LIMITED`.
- **Public demo:** not access-controlled. Use synthetic disposable accounts only.

### Authentication

Protected routes need `Authorization: Bearer <accessToken>` (scheme is case-insensitive).

| Token | Lifetime | Notes |
|---|---|---|
| Access token | 15 minutes | Opaque string; stored server-side only as a hash |
| Refresh token | 30 days | Single-use: every refresh returns a new pair. Reusing an old refresh token ends the session. A session also expires after 30 days without a successful refresh. |

Missing or blank header returns `401 UNAUTHENTICATED`. A bad, expired or revoked token returns `401 SESSION_EXPIRED`.
On `SESSION_EXPIRED` the client should call refresh once; if that also fails, return to sign-in. Store tokens securely and never log them.
Sign-out clears only this device's session. Account deletion is a separate, confirmed action.

## Public routes (no sign-in)

| Route | Request | Success | Errors |
|---|---|---|---|
| `GET /api/ingredients` | none | `200 {"ingredients":[string]}` | `503 GRAPH_UNAVAILABLE` |
| `POST /api/ingredients/parse` | `{"text":string}` (at most 2000 chars) | `200 {"included":[string],"excluded":[string],"excludedCategories":[string],"unrecognized":[string]}` | `400 INVALID_REQUEST`, `503 GRAPH_UNAVAILABLE` |
| `GET /api/filters` | none | `200 {"categories":[string],"cuisines":[string]}` | `503 SEARCH_UNAVAILABLE`, `503 GRAPH_UNAVAILABLE` |
| `POST /api/recipes/search` | see below | `200 {"recipes":[Result],"totalCount":int,"nextCursor":string or null}` | `400 INVALID_REQUEST`, `400 INVALID_CURSOR`, `400 INGREDIENTS_REQUIRED`, `503 SEARCH_UNAVAILABLE`, `503 GRAPH_UNAVAILABLE` |
| `GET /api/recipes/:id` | none | `200 RecipeDetail` | `400 INVALID_REQUEST`, `404 RECIPE_NOT_FOUND`, `503 SEARCH_UNAVAILABLE`, `503 GRAPH_UNAVAILABLE` |

Parse keeps anything it cannot match in `unrecognized`; show those terms to the person rather than dropping them.

**Search request** (all fields strict): `included` and `excluded` (string arrays, up to 100 unique items each, required),
`excludedCategories` (subset of `dairy`, `nuts`, `meat`, `fish/seafood`, default `[]`), `cuisines` (names from `/filters`, default `[]`; an
unknown cuisine returns `400 INVALID_REQUEST`), `maxMinutes` (`15`, `30`, `60` or `null`), `minRating` (`3`, `4` or `null`, default `null`), `cursor` (`null` for the first page).
`included` must contain at least one ingredient, otherwise `400 INGREDIENTS_REQUIRED` ("Add at least one ingredient to search.").
Only recipes using at least one included ingredient are returned, ordered by most matched included ingredients, then fewest
missing ingredients, then recipe id. Excluded ingredients and excluded categories hide recipes. `maxMinutes` hides slower recipes
and recipes without a time. `minRating` hides recipes whose effective rating (mean of user and dataset ratings, else the dataset
aggregate) is below the value, and unrated recipes; it does not change the order. `totalCount` is the number of recipes after
all filters. `minRating` returns `503 SEARCH_UNAVAILABLE` until the rating migration has run. Cursors are opaque and bound to
every criterion; a cursor from an older version returns `400 INVALID_CURSOR`.
To page, send the same criteria with the returned `nextCursor`; changing any criteria means starting over with `cursor: null`.

**Result:** `{"id","name","minutes":int or null,"matchedIngredients":[string],"missingIngredients":[string],"excludedIngredients":[string]}`.

**RecipeDetail:** `{"id","name","minutes":int or null,"instructions":[string] or null,"ingredients":[string],"cuisines":[string],
"ratings":{"individual":[int 1-5],"aggregate":number or null}}`. Ratings are anonymous and pool source-dataset and user values;
`aggregate` is their mean.

## Account routes

### Registration and verification (no sign-in)

| Route | Request | Success | Errors |
|---|---|---|---|
| `POST /api/accounts/register` | `{"email","username","password"}`; username 3-30 chars of `A-Za-z0-9_`; password at least 12 characters, no other rules | `201 {"message"}` | `400 INVALID_REQUEST`, `409 ACCOUNT_ALREADY_EXISTS`, `429 RATE_LIMITED`, `503 EMAIL_DELIVERY_FAILED` |
| `POST /api/accounts/verify` | `{"email","code"}`; code is exactly 8 digits | `200 {"message"}` | `400 INVALID_REQUEST`, `400 INVALID_VERIFICATION_CODE` |
| `POST /api/accounts/resend-verification` | `{"email"}` | `202 {"message"}` for any valid email | `400 INVALID_REQUEST`, `503 VERIFICATION_UNAVAILABLE` |

Verification codes expire after 24 hours, are single-use, and allow five failed attempts. A resend invalidates the previous code.
Verification emails are limited to 3 per account and 10 per source IP per rolling hour (initial registration counts).
Email and username are case-insensitive and returned lowercased. Unverified password accounts cannot sign in.

### Sign-in, sessions and recovery

| Route | Auth | Request | Success | Errors |
|---|---|---|---|---|
| `POST /api/accounts/sign-in` | no | `{"email","password","deviceName"?}` (deviceName up to 120 chars) | `200 {"sessionId","accessToken","refreshToken"}` | `400 INVALID_REQUEST`, `401 INVALID_CREDENTIALS`, `409 ACCOUNT_METHOD_CONFLICT`, `429 RATE_LIMITED` |
| `POST /api/accounts/sessions/refresh` | no | `{"refreshToken"}` | `200` new `{"sessionId","accessToken","refreshToken"}` | `400 INVALID_REQUEST`, `401 SESSION_EXPIRED` |
| `GET /api/accounts/sessions` | yes | none | `200 {"sessions":[{"sessionId","deviceName","createdAt","lastUsedAt","expiresAt","current"}]}` (times are epoch milliseconds; active sessions only) | 401 |
| `POST /api/accounts/sign-out` or `DELETE /api/accounts/sessions/current` | yes | none | `200 {"message"}` | 401 |
| `DELETE /api/accounts/sessions/:sessionId` | yes | none | `200 {"sessionId","message"}` | 401 |
| `POST /api/accounts/recover` | no | `{"email"}` | `202 {"message"}`, identical whether or not the account exists | `400 INVALID_REQUEST` |
| `POST /api/accounts/reset-password` | no | `{"email","code","password"}` | `200 {"message"}`; all of the account's sessions end | `400 INVALID_REQUEST`, `400 INVALID_VERIFICATION_CODE`, `429 RATE_LIMITED` |

`INVALID_CREDENTIALS` covers unknown email, unverified account and wrong password alike. `ACCOUNT_METHOD_CONFLICT` means the email is
registered with Google; accounts are never linked automatically. Recovery codes expire after one hour, are single-use, and allow five
failed attempts. Recovery applies to password accounts only.

### Google sign-in (not used by the Android demo)

`POST /api/accounts/google` with `{"idToken","username"?,"deviceName"?}`. `username` is required only when the Google identity has no
account yet. Returns `200` tokens, or `202 {"message"}` when the address still needs email verification, or `401 GOOGLE_IDENTITY_INVALID`,
`400 INVALID_USERNAME`, `409` conflict codes, `503 GOOGLE_SIGN_IN_UNAVAILABLE` when Google is not configured.

### Profile, favorites, ratings and deletion (all require sign-in)

| Route | Request | Success | Errors |
|---|---|---|---|
| `GET /api/accounts/me` | none | `200 {"email","username"}` only | 401 |
| `DELETE /api/accounts/me` | `{"confirm":true}` | `200 {"message"}`; removes the account, sessions and favorites; ratings stay without any owner link | `400 INVALID_REQUEST`, 401 |
| `GET /api/accounts/favorites` | none | `200 {"favorites":[{"id","name","minutes","ingredientNames":[string]}]}` | 401 |
| `POST /api/accounts/favorites` | `{"recipeId"}` | `200 {"added":bool,"recipeId"}` | `400 INVALID_REQUEST`, `404 RECIPE_NOT_FOUND`, 401 |
| `DELETE /api/accounts/favorites/:recipeId` | none | `200 {"removed":bool,"recipeId"}` | `404 RECIPE_NOT_FOUND`, 401 |
| `GET /api/accounts/ratings/:recipeId` | none | `200 {"recipeId","rating":int 1-5 or null}`; the caller's own rating | `404 RECIPE_NOT_FOUND`, 401 |
| `POST /api/accounts/ratings` | `{"recipeId","rating"}`; rating is a whole number 1-5 | `200 {"recipeId","rating"}`; creates or replaces the caller's single rating | `400 INVALID_REQUEST`, `404 RECIPE_NOT_FOUND`, 401 |
| `DELETE /api/accounts/ratings/:recipeId` | none | `200 {"recipeId","removed":true}` | `404 RECIPE_NOT_FOUND`, 401 |

"401" above means `UNAUTHENTICATED` or `SESSION_EXPIRED` as described under Authentication.

## Global error codes

`INVALID_JSON` (400, malformed body), `REQUEST_TOO_LARGE` (413), `RATE_LIMITED` (429), `INTERNAL_ERROR` (500). Client states from the PRD
map as: validation = `400`, not found = `404`, unavailable = `503` or a network failure, rate limited = `429`.
