---
id: SPEC-account-backed-backend
companions:
  - bmad-roadmap.md
  - ../../../docs/prd.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Account-backed Backend

## Why

Home cooks can already find and inspect recipes, but cannot keep favorites or record personal ratings. Account-backed capabilities make those journeys persistent and private, and must be completed before the first-party Android client begins.

## Capabilities

- **CAP-1**
  - **intent:** A person can register an account with a unique email and username and verify the email address.
  - **success:** Duplicate email or username registration is rejected; an unverified password account cannot sign in; verification credentials are single-use and expire.
- **CAP-2**
  - **intent:** A person can sign in or recover password access using the account's registered method.
  - **success:** Recovery responses do not reveal whether an email has an account; password reset ends existing sessions; method conflicts identify the registered method without linking accounts.
- **CAP-3**
  - **intent:** A person can create or access an account with Google.
  - **success:** The backend verifies the identity credential, accepts Google's verified email without separate email verification, and does not automatically link conflicting accounts.
- **CAP-4**
  - **intent:** A person can manage signed-in sessions across devices.
  - **success:** A person can list sessions with device name and last-used time; sign-out and remote termination prevent further token refresh; reuse of a rotated refresh token ends that session.
- **CAP-5**
  - **intent:** An account holder can create, update, and remove at most one rating per recipe.
  - **success:** A second rating updates the existing one; source and user ratings combine on the same scale without exposing user identities.
- **CAP-6**
  - **intent:** An account holder can save, remove, and retrieve favorite recipes.
  - **success:** “My Recipes” returns saved recipes, and deleting the account removes its favorites.
- **CAP-7**
  - **intent:** A person can delete their account and associated personal data.
  - **success:** Account data, sessions, and favorites are removed; retained ratings remain only after their identity link is removed.

## Constraints

- Passwords are stored only as salted hashes; refresh tokens are stored only as hashes. Verification and recovery credentials are single-use, expiring, and attempt-limited.
- Preserve API request validation and rate limiting. Endpoints that read or change account, session, favorite, or rating data require authentication.
- Never persist or expose dataset contributor/rater identities or expose user-rating identities to other users.
- Verify source-rating values and available counts before finalizing user-rating validation or aggregation.
- Use BMAD specs and planning artifacts for requirements, architecture, stories, and implementation planning. Complete backend account capabilities before Android work.

## Non-goals

- Android or other client implementation.
- Recommendations or a public third-party API.
- Automatic account linking, roles, or written reviews.

## Success signal

A person can use password or Google access to manage backend sessions, ratings, and favorites. API tests for PRD requirements FR-13 through FR-21 pass for valid, invalid, and privacy-sensitive behavior, including verification and recovery, session termination, repeated-rating updates, and anonymous ratings. Android work starts only after these backend capabilities are complete.

## Assumptions

- The existing API and recipe graph remain the product baseline; these capabilities extend the backend.

## Open Questions

- What are the imported source-rating scale and counts, and how should user ratings combine with source aggregates when individual values or counts are unavailable?
- What access-token and refresh-token lifetimes and session inactivity expiry should apply?
- How and through which email service should verification and recovery credentials be delivered, and how should links open in the future Android client?
- What API compatibility and versioning guarantees are required for first-party mobile clients?
