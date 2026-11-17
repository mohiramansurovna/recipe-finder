# Recipe Graph backend

Private ingredient-first recipe discovery API backed by Neo4j. The API provides
ingredient parsing, filtered recipe search with ranked cursor pagination, and
recipe details, plus account-backed sessions, ratings, and favorites. There is
no web client in this repository. For how the layers, routes, and service
functions connect, see [`docs/backend-overview.md`](docs/backend-overview.md);
client request/response shapes and error codes are in
[`docs/api-contract.md`](docs/api-contract.md).

## API source layout

- `api/src/index.ts` validates environment settings and starts/shuts down the
  API and Neo4j driver.
- `api/src/app.ts` composes services, middleware, and HTTP routing.
- `api/src/application/` contains ingredient parsing and application services.
- `api/src/core/` contains recipe and ingredient types, repository contracts,
  and search cursor logic.
- `api/src/infrastructure/` contains Neo4j queries, repositories, readers, and
  data mappers.
- `api/src/interface/http/` contains Express routes, request schemas, and
  error handling.
- `tests/` covers these boundaries and the public API contracts.

## Requirements

- Node.js 20+ and npm
- Docker Compose v2 for local graph and API
- Python 3 and `uv` for optional dataset acquisition

## Prepare local data

Dataset files are local-only in `data/raw/` and `data/prepared/`. Never commit
raw/prepared data, credentials, or deployment state. To download the pinned
Food.com dataset, configure Kaggle authentication locally, then run:

```sh
uv venv .venv
uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/python -m scripts.download_dataset
npm ci
npm run prepare:data
```

Preparation validates the pinned source, reports excluded/invalid records,
omits contributor and rater identities, and writes graph-ready CSVs. It does
not require network access once source files are present.

## Run the local API

Create `.env` from `.env.example` and set a strong local `NEO4J_PASSWORD`.
With prepared data available, start the graph, guarded importer, API, and local
Caddy ingress:

```sh
docker compose up --build
```

Neo4j and Caddy bind to loopback; Neo4j is not publicly exposed. The importer
waits for database readiness, refuses an unmarked non-empty graph, and records
successful Compose imports so restarts do not re-import data. The API becomes
available only after import and the account-schema migration succeed. The migration
checks the graph-level recipe import marker and recipe constraints; the separate
Compose import marker is not used as proof of graph readiness. Local Compose uses
Mailpit for verification email: open `http://localhost:8025` to inspect messages.
Local Compose also starts Redis (`redis`), used only as the search candidate cache:
it is capped by `REDIS_MAXMEMORY` with `allkeys-lru` eviction, entries expire after
`SEARCH_CACHE_IDLE_SECONDS` (default 300) without use and are rebuilt after
`SEARCH_CACHE_MAX_AGE_SECONDS` (default 86400). Sessions, refresh tokens and rate
limits stay in Neo4j. Without `REDIS_URL`, or if Redis is down, search queries
Neo4j directly. The demo AWS stack does not include Redis.
Mailpit's SMTP port and web inbox bind only to host loopback; the API connects to
its internal `mailpit:1025` service. Local signup does not need Resend credentials
or a verified sender domain. Set a random `VERIFICATION_CODE_SECRET` of at least
32 characters in `.env` before starting Compose. Keep the verification secret stable across restarts and API instances:
rotating it invalidates outstanding codes and resets the effective per-IP
issuance quota. The demo deployment remains explicitly configured for Resend and requires
`EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, and `EMAIL_FROM` set to a verified
Resend sender address in `.env.demo`. Mailpit is not included in the demo stack.

Graphs imported by an earlier release do not yet have the graph-level completion
record. Rebuild such a graph from prepared data before upgrading; for local
development, `docker compose down -v` removes the graph and its import marker,
after which `docker compose up --build` imports it again. This is destructive
and should only be done when the graph can be recreated from the prepared data.

The local ingress port defaults to `8080`. Set `APP_PORT` in `.env` to choose
another loopback port.

- Health: `http://localhost:8080/health`
- Filters: `http://localhost:8080/api/filters`
- Ingredient vocabulary: `http://localhost:8080/api/ingredients`
- Parsing: `POST http://localhost:8080/api/ingredients/parse`
- Search: `POST http://localhost:8080/api/recipes/search`
- Details: `GET http://localhost:8080/api/recipes/<id>`
- Register: `POST http://localhost:8080/api/accounts/register`
- Verify: `POST http://localhost:8080/api/accounts/verify`
- Resend verification: `POST http://localhost:8080/api/accounts/resend-verification`
- Sign in: `POST http://localhost:8080/api/accounts/sign-in`
- Current profile: `GET http://localhost:8080/api/accounts/me` (Bearer access token)
- Sessions: `GET /api/accounts/sessions`, `POST /api/accounts/sessions/refresh`,
  `POST /api/accounts/sign-out`, and `DELETE /api/accounts/sessions/:sessionId`
- Recovery: `POST /api/accounts/recover` and `POST /api/accounts/reset-password`
- Google sign-in: `POST /api/accounts/google` (requires Google client ID configuration)
- Favorites: `GET` and `POST /api/accounts/favorites`, then
  `DELETE /api/accounts/favorites/:recipeId`
- Ratings: `GET /api/accounts/ratings/:recipeId`, `POST /api/accounts/ratings`,
  and `DELETE /api/accounts/ratings/:recipeId`
- Delete account: `DELETE /api/accounts/me` with `{ "confirm": true }`

Profile reads, session listing/revocation, favorites, ratings, and account deletion
operations require `Authorization: Bearer <accessToken>`. The profile response
contains only the signed-in account's normalized email and username. Sign-in
returns an opaque access token (valid for 15 minutes) and refresh token (rotated
on use, with a 30-day lifetime); store these securely and never log or share
them. The refresh endpoint uses the current refresh token in its request body.
Password recovery returns the same accepted response for known and
unknown addresses. Public recipe details include identity-free individual
ratings and their combined mean when available.

Use synthetic disposable accounts only against the publicly reachable demo.
Never send real personal information or credentials there.

Registration accepts `{ "email": "...", "username": "...", "password": "..." }`.
Email is trimmed and case-folded; usernames are case-folded and must contain
3–30 ASCII letters, numbers, or underscores. Passwords must be at least 12
characters. A successful registration returns `201`; invalid input returns
`400 INVALID_REQUEST`, duplicates return `409 ACCOUNT_ALREADY_EXISTS`, and
issuance limits return `429 RATE_LIMITED`.

Verification accepts `{ "email": "...", "code": "12345678" }`; codes expire
after 24 hours and become unusable after five failed attempts. Success returns
`200`; invalid, expired, reused, or exhausted codes return
`400 INVALID_VERIFICATION_CODE`.

Resend accepts `{ "email": "..." }` and returns `202` with the same response for
known, unknown, and rate-limited addresses. Initial sends and resends share
limits of 3 per account and 10 per source IP in a rolling hour. Verification
emails are sent only after account and challenge state has committed. A failed
initial delivery returns `503 EMAIL_DELIVERY_FAILED` while leaving the account
eligible for the non-enumerating resend flow; resend delivery failures are
reported internally without changing the public response.

#### Account endpoint contracts

Sign-in accepts `{ "email": "...", "password": "...", "deviceName": "..." }`
and returns `{ "sessionId": "...", "accessToken": "...", "refreshToken": "..." }`.
Invalid credentials return `401 INVALID_CREDENTIALS`. Google sign-in accepts
`{ "idToken": "...", "username": "...", "deviceName": "..." }`; username is
required only when creating a new account. Existing Google accounts may omit it.
A new account whose Google email needs verification receives `202`; verified
identities receive the same session response as password sign-in.

The current profile returns `{ "email": "...", "username": "..." }`. The
sessions endpoint returns `{ "sessions": [...] }`, with each entry containing
`sessionId`, `deviceName`, `createdAt`, `lastUsedAt`, `expiresAt`, and `current`.
Sign-out and session termination return a message; refresh accepts
`{ "refreshToken": "..." }` and returns a new session response. Always replace
the stored refresh token after rotation.

Recovery accepts `{ "email": "..." }` and returns the same `202` response for
known and unknown accounts. Password reset accepts
`{ "email": "...", "code": "12345678", "password": "..." }`.
Favorites use `{ "recipeId": "..." }` for add and return a `favorites` array
for list. Ratings use `{ "recipeId": "...", "rating": 1 }`; the authenticated
rating read returns `{ "recipeId": "...", "rating": null }` when the account
has not rated that recipe. Account deletion accepts `{ "confirm": true }`.
Profile, session listing/revocation, favorite, rating, and account-deletion
endpoints require an authenticated session.

Example search request:

```sh
curl --fail --silent --show-error \
  -H 'Content-Type: application/json' \
  -d '{"included":["chicken"],"excluded":[],"excludedCategories":[],"cuisines":[],"maxMinutes":null,"cursor":null}' \
  http://localhost:8080/api/recipes/search
```

Stop with Ctrl-C or `docker compose down`; both preserve the graph and import
marker. To intentionally rebuild the graph from prepared CSVs, use
`docker compose down -v` and then start Compose again. This removes the local
graph and import marker.

For host-side API development, set `NEO4J_URI=bolt://localhost:7687` and
`SMTP_HOST=localhost` in `.env`, start
`docker compose up neo4j importer account-migration mailpit`, then run
`npm run dev:api` in another terminal. Add `redis` to that command and set
`REDIS_URL=redis://localhost:6379` to use the search cache.

The account-schema migration (`npm run migrate:accounts`, run automatically by
Compose) also strips owner fields from ratings and backfills `ratingAverage` and
`ratingCount` on recipes; run it once on graphs imported earlier. Measure search
latency against a loaded graph with `npm run benchmark:search`
(`BENCHMARK_RUNS` sets repetitions).

## Checks

```sh
npm ci
npm run check
npm run build:api
```

The check suite includes parser, API, graph integration, import, and deployment
safety tests. Graph integration tests may skip when no test graph is configured.

## Temporary HTTPS demo

The demo is operator-managed and creates billable AWS resources. Do not launch
it until all security-review items below are checked, required configuration
and data are verified, and the estimated cost is within the configured budget.
The budget alert is advisory, not a spending cap. GitHub Actions only publishes
the importer and API images; it does not provision cloud resources or receive
AWS credentials.

The demo API has no authentication: anyone who can reach its public HTTPS
hostname can call the API. Do not treat the demo endpoint as private or send it
secrets or personal data.

Operator tools: AWS CLI, Terraform 1.6.6+, Docker with Compose v2, Git, SSH
client (`ssh`, `ssh-keyscan`, `ssh-keygen`), `rsync`, `curl`, Node.js 20+, and
the local private key matching the configured public key.

Configure `.env.demo` from `.env.demo.example`, with the current public SSH
address as a `/32`, a protected SSH key pair, public GHCR owner, prepared-data
directory, full published image commit SHA, Resend API key, verified sender
email, a random `VERIFICATION_CODE_SECRET` of at least 32 characters, realistic
cost estimate, budget limit, and notification email. Keep `.env.demo`, Terraform
state/plans, keys, and data private. Run local checks before deployment:

After the first image publication, set both the importer and API GHCR packages
to **Public** in GitHub package settings so the demo host can pull them without
registry credentials.

```sh
npm run check
terraform -chdir=infra fmt -check -recursive
terraform -chdir=infra init -backend=false
terraform -chdir=infra validate
NEO4J_PASSWORD=validation-password DEMO_HOSTNAME=demo.example.test \
  docker compose -f docker-compose.demo.yml --env-file .env.demo config
bash -n scripts/demo-up.sh scripts/demo-down.sh scripts/demo-smoke.sh
```

Launch with `./scripts/demo-up.sh`. The script validates the review gate,
configuration, cost, data, image revision, and public SSH `/32`; requires the
operator to type `CREATE BILLABLE AWS RESOURCES`; creates a dedicated network
and budget before the instance; verifies the SSH host key against AWS-authenticated
console output; transfers data over verified SSH; and reports readiness only
after import, HTTPS health, and a successful API recipe search. Only HTTPS
ingress is public; Neo4j and the API remain on the private network.

After review, run `./scripts/demo-down.sh` and type
`DESTROY RECIPE FINDER DEMO RESOURCES`. The command retains Terraform state
unless teardown and AWS resource checks succeed. If state is missing or
teardown fails, do not guess resource IDs or delete by generic name: retain the
state, verify the AWS account and region, inspect exact stack-owned IDs, and
remove only confirmed demo resources. Keep state until all teardown checks pass.

#### State-loss or partial-destroy recovery

1. Stop deployment retries. Preserve any state, state backups, plans, logs, and
   `.env.demo`. Verify the account and region with
   `aws sts get-caller-identity` and the configured `DEMO_REGION`.
2. If the original state is present, fix the reported AWS error and rerun
   `./scripts/demo-down.sh`. Do not remove state or initialize a replacement
   state to force a destroy.
3. If state is unavailable, inventory candidates using read-only AWS
   `describe-*` commands in `DEMO_REGION`. Match the exact stack prefix,
   `Project=recipe-finder-demo` tags, IDs, and creation time against retained
   plans/logs and the expected resource inventory. Have a second operator
   verify ownership; do not act on a generic name or an unverified ID.
4. Remove only confirmed resources, in dependency order: terminate the exact
   demo instance; wait for its network interfaces to detach; release its exact
   Elastic IP; delete its security group, key-pair resource, and budget; then
   remove the stack's route-table association, subnet, route table, internet
   gateway (detach first), and VPC. Supply the verified IDs and
   `--region "$DEMO_REGION"` to each destructive AWS command.
5. Re-run read-only checks to confirm those exact resources are absent. Keep
   any surviving state until teardown is verified; do not delete unrelated
   account resources.

### Demo security review gate

The launch script requires all review items, reviewer, review date, and
provisioning approval below. Mark the current-review item only after reviewing
the current code/configuration; fill in the current reviewer, date, and renewed
deployment approval. New provisioning remains blocked until those current
fields and every checklist item pass the executable gate.

- [x] Confirm public ingress is limited to TCP 80/443 and SSH to the operator's current `/32`; Neo4j and the API container port are not directly exposed.
- [x] Confirm credentials, generated environment files, SSH private keys, prepared data, Terraform state, and plans are excluded from Git and published images.
- [x] Confirm the SSH host key is verified against AWS-authenticated console output and host-key checking is enabled.
- [x] Confirm image publication uses GitHub package permissions only and has no AWS credentials, OIDC role, or deployment permissions.
- [x] Confirm the estimate includes instance, storage, public IPv4, and expected run time; validate budget notification and understand its advisory nature.
- [x] Confirm prepared data transfers over verified SSH and contains no contributor or rater identities.
- [x] Confirm Terraform state is protected and retained through teardown verification.
- [ ] Re-review the current deployment code and configuration before any new provisioning; the 2026-11-04 review does not cover these changes.

**Reviewer**: Operator (confirmed in chat)

**Review date**: 2026-11-04

**Historical approval to provision billable AWS resources**: Granted by operator for the demo launched on 2026-11-04 only. It is not approval for a new deployment; complete the unchecked current-deployment review item and obtain renewed approval first.

**Current deployment reviewer**: _Not reviewed_

**Current deployment review date**: _Not reviewed_

**Current approval to provision billable AWS resources**: _Not granted_
