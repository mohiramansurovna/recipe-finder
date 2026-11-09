---
title: 'Register and Verify a Password Account'
type: 'feature'
created: '2026-11-09'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '4fef5de17abc5771797e1563a2cd8e4de93eb524'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A person cannot yet create an email-verified password account, so account-backed recipe features have no secure identity foundation.

**Approach:** Add password-account registration, email verification, and verification-code resend through the existing API boundaries. Persist account and challenge state in Neo4j, deliver codes through Resend after the write commits, and gate API readiness on the separate account-schema migration.

## Boundaries & Constraints

**Always:** Normalize email by trimming and case-folding; normalize usernames by case-folding and require 3–30 ASCII letters, numbers, or underscores. Enforce unique normalized email and username, including concurrent attempts. Require passwords of at least 12 characters with no composition rules; hash with Argon2id at the OWASP baseline (at least 19 MiB memory, two iterations, parallelism one) and fresh salts. Use cryptographically random eight-digit, single-use verification codes, expire them after 24 hours, allow at most five failed attempts, and keep only one active challenge per account/purpose. Resend invalidates its predecessor. Limit initial verification sends and resends together to 3 per account and 10 per source IP in any rolling hour. Persist only password/code hashes; never log or return raw credentials. Persist account/challenge state before email delivery, call Resend after commit, and report delivery failures explicitly. Run the idempotent account migration after successful recipe import and before the API; verify graph-level import completion and required recipe schema. Preserve current `/api` behavior and explicit validation/error conventions.

**Never:** Implement password sign-in/session issuance, recovery/reset, Google sign-in, ratings, favorites, account deletion, or any client. Do not put account constraints in the recipe importer, trust the separate Compose import marker as proof of graph state, link accounts, or return/log passwords or raw codes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Registration | Valid unique email, username, and password | Create one unverified account and verification challenge; send the code after commit | No raw code/password in response or logs |
| Duplicate registration | Email or username already exists, including a concurrent race | No second account and no verification email | Explicit safe duplicate result |
| Verification | Current valid code for the account | Consume the challenge and mark the email verified atomically | Wrong, expired, reused, or exhausted code returns an explicit safe error |
| Resend | Known or unknown email | Same outward response; only an eligible account receives a replacement code | Do not reveal account existence; enforce issuance limits |
| Delivery failure | Account/challenge committed, Resend unavailable | Account remains recoverable through the non-enumerating resend flow | Report failure explicitly; do not claim delivery succeeded |
| Startup | Import incomplete, required recipe schema missing, or migration unavailable | Do not serve API traffic as ready | Fail startup/readiness explicitly without trusting the Compose marker |

</frozen-after-approval>

## Code Map

- `api/src/app.ts` -- Compose feature services, shared JSON parsing, the existing `/api` limiter, routing, and centralized errors; preserve middleware order and existing routes.
- `api/src/interface/http/api-router.ts`, `api/src/interface/http/routes/recipes.routes.ts`, and `api/src/interface/http/schemas/recipes.schemas.ts` -- Mount feature routes and reuse Zod validation, `sendError`, and async error forwarding patterns.
- `api/src/interface/http/api-error.ts` -- Reuse `ApiError` and the established `{ error: { code, message } }` response handling.
- `api/src/core/ingredients/ingredients.repository.ts`, `api/src/application/services/ingredients.service.ts`, and `api/src/infrastructure/neo4j/repositories/ingredients.neo4j.repository.ts` -- Follow the core-port, application-service, and Neo4j-adapter separation; use `api/src/infrastructure/neo4j/neo4j-sessions.ts` for session lifecycle.
- `api/src/index.ts` -- Composition root currently wires Neo4j recipe services; add account adapters and startup readiness checks here without putting provider or database logic in routes.
- `scripts/import-data.ts` and `scripts/compose-import.sh` -- Recipe import owns recipe constraints and records a separate marker; keep account schema migration separate and treat graph state as authoritative.
- `docker-compose.yml` and `docker-compose.demo.yml` -- Both currently order Neo4j, importer, and API; insert the one-shot account migration after importer and before API while preserving health and deployment protections.
- `.env.example` and `package.json` -- Add validated email/password-hashing configuration and only the selected runtime dependencies; current dependencies do not include Argon2 or a Resend client.
- `tests/recipe-search-api.integration.test.ts` and `tests/ingredient-api.integration.test.ts` -- Reuse Supertest/fake-service and existing validation/error/regression patterns; add account service, route, graph migration, and deployment coverage.

## Tasks & Acceptance

**Execution:**
- [x] `api/src/core/` and `api/src/application/services/` -- Define account/challenge contracts and registration, verification, and resend behavior -- keep domain rules independent of HTTP and Neo4j.
- [x] `api/src/infrastructure/neo4j/` -- Persist normalized unique accounts and hashed one-time challenges with retry-safe atomic transitions -- prevent duplicate identities, challenge reuse, and partial verification.
- [x] `api/src/infrastructure/` and `api/src/index.ts` -- Add Argon2id and Resend adapters/configuration -- keep provider calls outside database transactions and fail clearly on invalid configuration.
- [x] `api/src/interface/http/` -- Add validated registration, verification, and resend routes -- preserve existing error shapes and account-existence privacy.
- [x] `scripts/`, `docker-compose.yml`, and `docker-compose.demo.yml` -- Add an idempotent post-import account-schema migration and readiness gate -- prevent API readiness before graph import/schema validation.
- [x] `tests/` -- Cover input, uniqueness races, code expiry/attempts/reuse, resend privacy/limits, delivery failure, migration/readiness, and recipe API regressions -- verify the story's security and compatibility guarantees.

**Acceptance Criteria:**
- Given valid new credentials, when a person registers, then one unverified account and one active verification challenge are persisted atomically and an eight-digit code is sent through Resend only after commit.
- Given registration input, when validation runs, then email and username normalization and the 3–30-character username and 12-character password policies are enforced.
- Given duplicate email or username, including a concurrent uniqueness race, when registration is attempted, then an explicit safe duplicate result is returned without creating another account or sending another code.
- Given a verification code, when submitted, then only the current unused, unexpired challenge with fewer than five prior failed attempts can verify the account; consumption and failed-attempt updates are atomic.
- Given a resend request for a known or unknown email, when processed, then both receive the same public response, a replacement invalidates the earlier challenge, and initial registration sends plus resends are limited to 3 per account and 10 per source IP in any rolling hour.
- Given email delivery fails after persistence, when registration or resend completes, then the API reports failure explicitly and the account remains recoverable through the non-enumerating resend flow.
- Given importer completion and a clean graph, when startup proceeds, then the separate idempotent migration verifies graph-level import completion and required recipe schema, creates account constraints, and gates API readiness in both Compose deployments.
- Given existing recipe API requests, when account routes and readiness are added, then their contracts and behavior remain unchanged and relevant account, migration, privacy, error, and regression tests pass.

## Implementation Notes

The existing `/health` route is used by deployment health checks. Preserve its path and healthy response shape while ensuring readiness reflects Neo4j connectivity and the required account schema. Keep account migration separate from the recipe importer and use the graph's import-completion state rather than the Compose marker.

## Spec Change Log

## Review Triage Log

## Design Notes

Registration and the first verification message have different commit boundaries: first commit the account and hashed challenge, then call Resend. A delivery failure must not roll back committed identity state or appear successful; the non-enumerating resend path is the recovery mechanism. No database write transaction may contain an external provider call.

## Verification

**Commands:**
- `npm run check` -- expected: lint, type-check, unit/integration tests, and existing API regression checks pass.
- `npm run build:api` -- expected: API build succeeds with the new account composition.
- Targeted graph/deployment checks with a valid test graph -- expected: migration is idempotent, rejects incomplete import/schema state, and gates API readiness in both Compose deployments.
