---
title: 'Password Account Registration, Verification, and Recovery'
type: 'feature'
created: '2026-11-07'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/prd.md'
  - '{project-root}/_bmad-output/specs/spec-account-backed-backend/SPEC.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The API has no password-backed accounts, so a person cannot create an email-verified identity or recover account access.

**Approach:** Add backend account registration, email verification, and password recovery using the existing API's validation, error, and persistence boundaries. Deliver verification and recovery codes through Resend.

## Boundaries & Constraints

**Always:** Normalize email and username case-insensitively; usernames are 3 to 30 ASCII letters, numbers, or underscores. Passwords are at least 12 characters with no composition rules. Do not permit a password account to sign in before email verification. Store only salted password hashes and hashed verification/recovery credentials; codes expire after 24 hours for verification and 1 hour for recovery, and allow at most five failed attempts each. Password-recovery and verification-resend requests must not disclose whether an account exists. Preserve API validation, error conventions, and rate limiting; never log or return passwords or raw credentials. Keep Resend credentials and sender configuration in local environment settings, not source control.

**Never:** Implement Google sign-in, access/refresh sessions or sign-in issuance, ratings, favorites, account deletion, or any client. Later session work must ensure password reset ends existing sessions.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Registration | Valid unique email, username, and password | Create an unverified password account and send its verification code through Resend | Explicit validation/conflict errors; no credential in API response or logs |
| Duplicate registration | Email or username already belongs to an account | Do not create a second account | Explicit conflict response |
| Email verification | Valid, unused code for an unverified account | Mark the email verified; reject reuse | Invalid, expired, used, or attempt-limited codes return an explicit client error |
| Resend verification | Known or unknown email | Same outward response; send a new verification code only for an unverified matching account | Do not expose account existence |
| Password recovery request | Known or unknown email | Same outward response; send a recovery code only for a matching account | Do not expose account existence |
| Password reset | Valid, unused recovery code and accepted new password | Replace password hash; consume code | Invalid, expired, used, or attempt-limited codes return an explicit client error |

</frozen-after-approval>

## Code Map

- `api/src/app.ts` -- Compose the new account service/router alongside existing services; retain shared JSON parsing and API rate limiting.
- `api/src/interface/http/api-router.ts` -- Mount the account routes without changing existing route contracts.
- `api/src/interface/http/routes/recipes.routes.ts` and `api/src/interface/http/schemas/recipes.schemas.ts` -- Reuse route-level schema validation, explicit errors, and async error forwarding patterns.
- `api/src/interface/http/api-error.ts` -- Reuse `ApiError`, `sendError`, and the central error handler for explicit failures.
- `api/src/core/` and `api/src/application/services/` -- Add account types/repository contract and lifecycle service following the existing domain/service separation.
- `api/src/infrastructure/neo4j/` -- Add account persistence using the existing Neo4j driver/session pattern; `scripts/import-data.ts` only creates recipe-data constraints, so account uniqueness must be established separately.
- `api/src/index.ts` -- Wire persistence and Resend configuration at startup; currently only Neo4j settings are configured.
- `tests/recipe-search-api.integration.test.ts` and `tests/ingredient-api.integration.test.ts` -- Follow the Supertest API contract and invalid-input/error test patterns; add account-specific unit and graph integration coverage.
- `docs/prd.md` and `_bmad-output/specs/spec-account-backed-backend/SPEC.md` -- Source contract; preserve its account privacy and security requirements, applying only the selected password-account slice.

## Tasks & Acceptance

**Execution:**
- [ ] `api/src/core/` and `api/src/application/services/` -- Define account lifecycle contracts and registration, verification, and recovery rules -- keep business behavior independent of HTTP and Neo4j.
- [ ] `api/src/infrastructure/neo4j/` -- Persist accounts and one-time credential state with unique identifiers and hashed secrets -- prevent duplicate accounts and credential reuse.
- [ ] `api/src/interface/http/` -- Add validated registration, verification, verification-resend, recovery-request, and password-reset endpoints -- match existing API error conventions and avoid account disclosure during recovery or resend.
- [ ] `api/src/index.ts`, `api/src/app.ts`, and `.env.example` -- Wire Resend, sender, and account persistence configuration -- fail clearly on invalid required configuration.
- [ ] `tests/` -- Cover valid/invalid input, duplicate identifiers, verification/reset expiry and reuse, recovery privacy, hashing, attempt limits, and graph persistence -- prove the stated behaviors and protect existing endpoints.

**Acceptance Criteria:**
- Given valid new credentials, when a person registers, then one unverified account is created and a verification code is delivered through Resend without returning or logging the code.
- Given an unverified password account, when its owner submits a code, then it becomes verified only if the code is valid, unused, unexpired, and within its attempt limit.
- Given a known or unknown email, when verification is requested again, then the response is indistinguishable and a new code is sent only to a matching unverified account.
- Given an unknown or known email, when password recovery is requested, then the public response is indistinguishable and only a matching account receives a recovery code.
- Given a valid recovery code, when a new accepted password is submitted, then only its salted hash is stored and that code cannot be used again.
- Given duplicate identifiers, malformed requests, expired/reused codes, or exhausted attempts, when the relevant endpoint is called, then it returns an explicit safe error and creates no unauthorized state change.
- Given registration or recovery email delivery fails, when the API reports the failure, then persisted account state remains recoverable through the non-enumerating resend/recovery endpoints.
- Given existing recipe API requests, when account endpoints are added, then existing request behavior and `npm run check` remain successful.

## Implementation Notes

## Design Notes

Account creation and outbound email are durable side effects; no existing recipe data is changed. Persist the account and hashed one-time credential before calling Resend so delivery failures can be retried through the non-enumerating resend/recovery endpoints. Report delivery failures explicitly. Use an eight-digit, cryptographically generated numeric code for verification and recovery.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run check` -- expected: lint, type-check, and all tests pass.
