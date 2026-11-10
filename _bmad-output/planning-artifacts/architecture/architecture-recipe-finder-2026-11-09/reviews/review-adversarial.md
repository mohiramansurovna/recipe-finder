# Adversarial architecture review

Scope: the target architecture was checked against the canonical account SPEC and source-rating audit, `docs/prd.md`, `README.md`, and the existing Compose, import, and API code. Findings focus on interactions that can make independently implemented stories disagree or violate the stated behavior.

## Findings

### 1. Concurrent duplicate registration has no specified conflict contract

**Scenario:** Two registration requests use the same normalized email (or username). Both observe no existing account, then race to create the account and verification credential. The graph constraint rejects one write, but the architecture does not say how the repository/service translates that constraint failure into the required duplicate-registration response or ensures the loser does not send an email.

**Impact:** The losing request may surface as an internal error rather than a duplicate rejection; implementations can diverge on whether a verification email is sent for a failed registration. Case normalization is mentioned, but its canonicalization rules are not fixed.

**Evidence:** `ARCHITECTURE-SPINE.md:40,52,78,82`; `SPEC.md:20-23`; `docs/prd.md:119-121`.

**Missing guard:** Define canonical email/username normalization, make account-plus-credential creation one conditional transaction, and require unique-constraint races to map to the same explicit duplicate result as the pre-check path. Send mail only after the winning transaction commits.

### 2. Concurrent code submissions can race the single-use and attempt-limit checks

**Scenario:** Two requests submit the same valid verification or recovery code, or concurrent guesses arrive when the failure count is four. Each transaction can read the same unused/under-limit state before either writes its consumption or increment.

**Impact:** A one-time code may be accepted more than once, two password resets may succeed, or more than five failed attempts may be admitted. A managed transaction alone does not specify a conditional consume/increment protocol.

**Evidence:** `ARCHITECTURE-SPINE.md:52,58`; `SPEC.md:22,44`; `docs/prd.md:137,141`.

**Missing guard:** Require a serialized compare-and-set transition on the credential record: consume only while unused and unexpired, and increment failed attempts only while below the limit. The request that loses the transition must fail without applying its protected change.

### 3. Resend behavior does not define whether older codes remain valid

**Scenario:** A person requests another verification or recovery code while an earlier one is still valid. The architecture says to persist credentials before delivery, but does not state whether resend invalidates the earlier code, resets its attempt counter, or creates another simultaneously valid challenge.

**Impact:** Different stories can accept different sets of codes; multiple active challenges can multiply the guessing budget, and a delayed email can deliver a code after a newer one was issued. Endpoint throttling is deferred, so it does not resolve challenge lifecycle semantics.

**Evidence:** `ARCHITECTURE-SPINE.md:52,58,153`; `SPEC.md:44-46`; `docs/prd.md:137,141`.

**Missing guard:** Define one active challenge per account and purpose, invalidate superseded challenges atomically, and specify how failed-attempt accounting and resend throttles behave across resends.

### 4. Concurrent refreshes can turn an ordinary overlap into session-wide revocation

**Scenario:** A client sends two refresh requests with the same current token before either response arrives. One rotates the token; the other then presents a rotated token and, under the stated replay rule, revokes the whole session. The successful request may already have returned a replacement token that is now unusable.

**Impact:** Network retries or concurrent client requests can sign a person out across that device even without token theft. If both transactions instead succeed, the one-successor rotation invariant is broken.

**Evidence:** `ARCHITECTURE-SPINE.md:52,64`; `SPEC.md:30-31`; `docs/prd.md:151-153`.

**Missing guard:** Specify refresh concurrency and lost-response behavior. Either require and test single-flight refresh at the client boundary, or define a narrowly scoped idempotent retry mechanism that does not weaken the rule that genuine reuse ends the session. Enforce one successor atomically.

### 5. Reset and refresh have no explicit shared revocation ordering

**Scenario:** A refresh request validates a session while a password-reset transaction revokes all sessions. If refresh does not re-check session state in the same serialized transaction that rotates the token, it can return replacement credentials after reset has completed.

**Impact:** A reset may appear successful while a concurrent refresh still issues credentials, contradicting immediate revocation and leaving behavior dependent on repository query ordering.

**Evidence:** `ARCHITECTURE-SPINE.md:52,64`; `docs/prd.md:141,153`.

**Missing guard:** Require refresh rotation to conditionally update only an active session and require reset/session termination to contend on that same session state. Return a replacement token only after the conditional rotation commits.

### 6. Protected-request authentication can race with reset or termination

**Scenario:** Authentication middleware resolves an active session, then password reset or remote termination commits, and the already-authorized request subsequently writes a rating or favorite in a separate transaction.

**Impact:** A request that was in flight at revocation can still change personal data after the architecture promises that access is invalidated immediately. Builders may interpret “every protected request must resolve” as a one-time middleware check, rather than a check coupled to the operation.

**Evidence:** `ARCHITECTURE-SPINE.md:52,64`; `SPEC.md:44-46`; `docs/prd.md:141,153`.

**Missing guard:** Define the authorization linearization point. For protected mutations, validate the active session in the same transaction as the mutation, or otherwise specify an equivalent session-version/revocation check that prevents stale authorization from committing.

### 7. A favorite write can race account deletion

**Scenario:** A favorite request passes authentication, then account deletion removes the account and its favorites, and the favorite request continues using a previously captured account ID. The architecture does not require the write to re-match a live account in its transaction.

**Impact:** Depending on the adapter, the operation can recreate an account-like node, leave a favorite attached to a deleted identity, or return success while deletion has already completed. That violates account-deletion cleanup and can make “My Recipes” inconsistent.

**Evidence:** `ARCHITECTURE-SPINE.md:52,70`; `SPEC.md:36-40`; `docs/prd.md:127-133`.

**Missing guard:** Require favorite add/remove and deletion to serialize on the account’s active state; favorite writes must match an existing, non-deleted account in the same transaction and must never `MERGE` a missing account.

### 8. A rating write can restore an identity link after deletion

**Scenario:** A rating update authenticates before deletion, then deletion removes the account and strips owner links from retained ratings, while the rating transaction later writes an owner link or account/recipe uniqueness key from stale authorization context.

**Impact:** A retained rating can become identifiable again or be left with a dangling owner/uniqueness key, contradicting the requirement to retain ratings only after removing their identity link.

**Evidence:** `ARCHITECTURE-SPINE.md:52,70`; `SPEC.md:32-40`; `docs/prd.md:123-133`.

**Missing guard:** Couple rating ownership checks and writes to the live account state in the same serialized transaction as deletion. Define deletion as a terminal state that stale rating requests cannot recreate or reattach.

### 9. Aggregate reads do not specify how to include ratings after owner unlink

**Scenario:** Account deletion anonymizes a user rating by removing its owner link. A recipe-detail aggregate query that counts only ratings reachable through an account-owned relationship then omits that retained rating.

**Impact:** Deleting an account changes the recipe’s aggregate even though the requirement says to retain its rating anonymously. An implementation that instead deletes the rating would also violate the retention contract.

**Evidence:** `ARCHITECTURE-SPINE.md:70,144,146`; `SPEC.md:34,40`; `docs/prd.md:131-133,147-149`.

**Missing guard:** Define the post-deletion rating representation and require aggregate reads to include every retained rating independent of whether it still has an owner link. Keep identity traversal separate from the aggregate’s value/count source.

### 10. Legacy aggregate-only data has no defined combination rule

**Scenario:** A recipe has `recipe.aggregateRating` but no individual `HAS_RATING` values. The existing detail API uses the aggregate as a fallback when no individual ratings exist; after user ratings are added, the architecture does not say whether that aggregate is a display-only fallback, a weighted input, or excluded.

**Impact:** Builders can produce incompatible means (drop the old aggregate, average the aggregate as if it were one rating, or double-count it when individual ratings also exist). A weighted mean cannot be reconstructed from an aggregate without its source count.

**Evidence:** `ARCHITECTURE-SPINE.md:70,144`; `docs/prd.md:147-149`; `api/src/infrastructure/neo4j/queries/recipes.queries.ts:68-75`; `api/src/infrastructure/neo4j/repositories/recipes.neo4j.repository.ts:126-139`; `scripts/import-data.ts:469-498`; `source-ratings.md:3,21-23`.

**Missing guard:** State that only individual source and user values participate in the combined mean, and define how aggregate-only records are handled (for example, migration/backfill with counts or an explicit unsupported/legacy fallback). Do not combine a precomputed mean with individual values absent its count.

### 11. An importer crash can leave a non-empty graph that cannot be retried

**Scenario:** Import writes recipe and rating batches, then the process exits before later batches finish. The Compose marker is written only after `npm run import:data` succeeds; on retry, the marker is absent, but `checkDatabaseEmpty` rejects the partially populated graph.

**Impact:** A transient failure leaves the graph incomplete, blocks the importer from completing, and consequently blocks API startup. Operators must discover and manually destroy/reset the graph rather than safely retrying.

**Evidence:** `scripts/import-data.ts:317-330,579-629`; `scripts/compose-import.sh:10-15`; `docker-compose.yml:49-56`; `docker-compose.demo.yml:46-53`.

**Missing guard:** Define a recoverable import protocol: staging then publish, explicit partial-import cleanup, or resumable idempotent batches with durable progress. Completion state must be committed only after all expected data is verified, and failures must have a documented safe recovery path.

### 12. A surviving `import_state` volume can mask a reset graph

**Scenario:** The Neo4j data volume is removed or replaced while the separate `import_state` volume remains. On the next start, `compose-import.sh` sees its marker and exits successfully without checking the graph, so Compose treats import as complete.

**Impact:** The migration receives an empty graph and fails, or an API started by incomplete readiness serves against a graph missing recipe data. This is precisely the stale-volume case the target architecture intends to prevent, but the existing early-exit path still implements it.

**Evidence:** `ARCHITECTURE-SPINE.md:40,134`; `scripts/compose-import.sh:4-8`; `docker-compose.yml:41-43,68-70`; `docker-compose.demo.yml:39-41,83-85`.

**Missing guard:** Make skip decisions from graph-level import completion plus required recipe-data checks, not the volume marker. Treat the volume marker only as an optimization that cannot override graph state, and define how old markers are handled on upgrade.

### 13. Migration and readiness are not wired into the existing startup chain

**Scenario:** The target requires `importer → migration → API`, but both current Compose files make API depend directly on importer and define no migration service. The demo healthcheck only calls `/health`, which unconditionally returns `{ status: "ok" }`; the local Compose API has no healthcheck although Caddy waits for `service_healthy`.

**Impact:** Separately implemented migration and API stories can pass locally but fail to run in either Compose deployment, or Caddy can route requests before required account constraints exist. In the local deployment, the configured Caddy dependency cannot become healthy without an API healthcheck.

**Evidence:** `ARCHITECTURE-SPINE.md:40,121,134`; `docker-compose.yml:45-62`; `docker-compose.demo.yml:43-65`; `api/src/app.ts:20-22`; `api/src/index.ts:18-35`.

**Missing guard:** Specify and implement the migration as a one-shot dependency in both Compose files. Define `/health` versus readiness semantics, make readiness verify Neo4j connectivity and account schema, and configure both deployments’ healthchecks and Caddy dependencies against readiness.
