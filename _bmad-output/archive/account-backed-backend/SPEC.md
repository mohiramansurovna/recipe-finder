---
id: SPEC-account-backed-backend
companions:
  - ../../planning-artifacts/architecture/architecture-recipe-finder-2026-11-09/ARCHITECTURE-SPINE.md
  - source-ratings.md
  - ../../../docs/prd.md
  - ../../../docs/backend-overview.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Account-backed Backend

## Why

Home cooks can already find and inspect recipes, but cannot keep favorites or record personal ratings. Account-backed capabilities make those journeys persistent and private, and are implemented in the backend; the first-party Android client proceeds in parallel against these API contracts.

## Capabilities

- **CAP-1**
  - **intent:** A person can register an account with a unique email and username and verify the email address.
  - **success:** Duplicate email or username registration is rejected; an unverified password account cannot sign in; verification credentials are single-use, expire, and allow at most five failed attempts.
- **CAP-2**
  - **intent:** A person can sign in or recover password access using the account's registered method.
  - **success:** Recovery responses do not reveal whether an email has an account; password reset ends existing sessions; method conflicts identify the registered method without linking accounts.
- **CAP-3**
  - **intent:** A person can create or access an account with Google.
  - **success:** The backend verifies the identity credential and uses its stable subject; Gmail and verified Workspace addresses with a hosted-domain claim need no separate email verification, while other addresses require Resend verification; conflicting accounts are not automatically linked.
- **CAP-4**
  - **intent:** A person can manage signed-in sessions across devices.
  - **success:** A person can list sessions with device name and last-used time; access tokens expire after 15 minutes, refresh tokens rotate and expire 30 days after issuance, and a session expires after 30 days without a successful refresh; sign-out, remote termination, and reuse of a rotated refresh token prevent further refresh.
- **CAP-5**
  - **intent:** An account holder can create, update, and remove at most one rating per recipe.
  - **success:** Ratings are whole-number values from 1 to 5; a second rating updates the existing one; the aggregate is the arithmetic mean of all individual source and user ratings, weighted by their counts, without exposing user identities.
- **CAP-6**
  - **intent:** An account holder can save, remove, and retrieve favorite recipes.
  - **success:** “My Recipes” returns saved recipes, and deleting the account removes its favorites.
- **CAP-7**
  - **intent:** A person can delete their account and associated personal data.
  - **success:** Account data, sessions, and favorites are removed; retained ratings remain only after their identity link is removed.

## Constraints

- Passwords are at least 12 characters with no composition rules, are stored only as salted hashes, and use the same policy for registration and reset; refresh tokens are stored only as hashes. Verification and recovery credentials are single-use, expiring, and limited to five failed attempts each.
- Resend delivers eight-digit verification codes that expire after 24 hours and recovery codes that expire after 1 hour.
- Keep one active verification or recovery code per account and purpose; resend invalidates the previous code. For verification messages, cap initial registration sends and resends together at 3 per account and 10 per source IP in any rolling hour.
- Preserve API request validation and rate limiting. Registration, sign-in, verification/resend, recovery/reset, and Google identity flows use their credential proof without an existing session. Active-session authentication protects account self-service, session operations, account-specific rating reads, and favorite/rating changes. Public recipe details may return combined rating aggregates and identity-free individual values.
- Never persist or expose dataset contributor/rater identities or expose user-rating identities to other users.
- Source ratings are individual whole-number values from 1 to 5; 0 means unrated and is excluded. Pool source and user values when computing aggregates.
- Raw and prepared dataset files remain local; do not commit them or copy them into application images.
- Keep existing `/api` routes stable, make compatible additions, and introduce a new API version only for breaking changes.
- Use BMAD specs and planning artifacts for requirements, architecture, stories, and implementation planning.

## Non-goals

- Android or other client implementation.
- Recommendations or a public third-party API.
- Automatic account linking, roles, or written reviews.

## Success signal

A person can use password or Google access to manage backend sessions, ratings, and favorites. API tests for PRD requirements FR-13 through FR-21 pass for valid, invalid, and privacy-sensitive behavior, including verification and recovery, session termination, repeated-rating updates, and anonymous ratings. Android development targets these API contracts in parallel (per the PRD and addendum).

## Assumptions

- The existing API and recipe graph remain the product baseline; these capabilities extend the backend.
