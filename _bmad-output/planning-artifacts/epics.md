---
status: complete
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - docs/prd.md
  - _bmad-output/specs/spec-account-backed-backend/SPEC.md
  - _bmad-output/planning-artifacts/architecture/architecture-recipe-finder-2026-11-09/ARCHITECTURE-SPINE.md
  - _bmad-output/specs/spec-account-backed-backend/source-ratings.md
  - _bmad-output/implementation-artifacts/spec-password-accounts.md
  - README.md
---

# recipe-finder - Epic Breakdown

## Overview

This document breaks down the account-backed backend scope (CAP-1 through CAP-7 / PRD FR-13 through FR-21) into implementable stories. Existing recipe API work and future Android requirements are outside this breakdown.

## Requirements Inventory

### Functional Requirements

- **FR-13:** Create accounts with unique email and username. Passwords are at least 12 characters with no composition rules. Unverified password accounts cannot sign in. Sign-in method conflicts identify the existing method and never link accounts automatically.
- **FR-14:** An authenticated account holder can create, update, and remove one 1–5 whole-number rating per recipe. Ratings contain no text; user identity is not exposed. Account-specific rating reads and changes require authentication, while public recipe details can show anonymous rating values and aggregates.
- **FR-15:** An authenticated person can add, remove, and retrieve favorite recipes in “My Recipes”; account deletion removes favorites.
- **FR-16:** Account deletion removes account data, sessions, and favorites; retained ratings remain only after their owner link is removed.
- **FR-17:** Resend delivers single-use eight-digit verification codes that expire after 24 hours and allow at most five failed attempts. Only one code per account and purpose is active; a resend invalidates the previous code. Initial registration sends and resends share rolling-hour limits of 3 per account and 10 per source IP.
- **FR-18:** Resend delivers single-use eight-digit recovery codes that expire after one hour and allow at most five failed attempts. Recovery responses do not disclose account existence; reset follows the password policy and ends existing sessions. Only one code per account and purpose is active; resends supersede earlier codes.
- **FR-19:** The backend verifies Google ID tokens and uses the verified stable subject. Gmail and verified Workspace addresses with a hosted-domain claim require no separate verification; other addresses require Resend verification. Google account creation requires a user-chosen unique username after identity verification; conflicting methods are not linked.
- **FR-20:** Public recipe details may include anonymous individual source and user ratings and their arithmetic mean, weighted by individual counts. Ratings use whole-number values 1–5; source value 0 is unrated and excluded. No user identity is returned.
- **FR-21:** Sessions issue 15-minute access tokens and rotating refresh tokens, each expiring 30 days after issuance; sessions expire after 30 days without a successful refresh. People can list sessions with device name and last-used time, sign out, and terminate other sessions. Reuse of a rotated refresh token ends the session; refresh tokens are stored only as hashes.

### NonFunctional Requirements

- **Privacy:** Do not persist or expose dataset contributor/rater identities or expose user-rating identities. Account deletion anonymizes retained user ratings.
- **Security:** Store passwords as salted hashes and refresh tokens as hashes. Verify Google tokens server-side; never trust client identity claims. Keep secrets out of logs. Attempt-limit and rate-limit verification/recovery flows.
- **API compatibility:** Preserve existing `/api` routes and request/error behavior; add compatible routes and introduce a version only for breaking changes. Validate inputs and return explicit errors.
- **Atomicity and reliability:** Use Neo4j transactions for account, credential, session, rating, favorite, and deletion state transitions. Keep provider calls outside transactions and report delivery failures explicitly. API readiness must verify Neo4j connectivity and required schema.
- **Data governance and reproducibility:** Raw/prepared data, credentials, and deployment state remain local and are not committed or packaged in application images. Preserve the existing import and backend setup workflow.
- **Testability:** Verify account requirements for valid, invalid, unavailable, not-found, concurrency, and privacy-sensitive behavior; retain regression coverage for existing API behavior. The existing approximate one-second search target remains unvalidated and is outside this account scope.
- **Scope boundary:** Android client requirements and Android-specific device storage/security are excluded until backend capabilities are complete.

### Additional Requirements

- Keep the existing modular Express API and ports-and-adapters direction. HTTP routes call application services; services depend on core contracts; Neo4j, email, Google identity, and password-hashing adapters implement outbound ports. `index.ts` wires the driver and repositories; `app.ts` composes services and HTTP routing.
- Neo4j is the only datastore. Enforce uniqueness with graph constraints and validate required properties in application code because Community uniqueness constraints do not enforce property existence.
- Run a separate, idempotent account-schema migration after recipe import and before API startup. Both Compose deployments must enforce `importer → migration → API`; API readiness must verify graph connectivity and required schema before Caddy serves requests.
- Graph-level import completion is authoritative; a separate Compose marker cannot make an empty/reset graph appear imported. Before account migration, recover an incomplete initial import by explicitly resetting both graph and import-state volumes; after account state may exist, never reset the graph for import recovery. Any future recipe refresh needs an account-preserving import path.
- Use retry-safe managed Neo4j transactions for account creation, challenge consumption, refresh/revocation, ratings, favorites, and deletion. Recheck active session and account state in protected mutations; make deletion terminal. Provider calls are outside transactions, with stable email idempotency keys where supported.
- Keep one active challenge per account/purpose; resend invalidates its predecessor, each code permits at most five failed attempts, and issuance is throttled per account and IP.
- Use opaque cryptographically random access/refresh tokens, store hashes only, validate active sessions for protected operations, rotate refresh tokens atomically, and revoke on reuse. Clients must serialize refresh calls.
- Use Argon2id with the OWASP baseline (at least 19 MiB memory, two iterations, parallelism one) and fresh salts. Bound concurrent password hashing and benchmark the selected Node package.
- Keep user ratings separately queryable after owner-link removal so aggregates retain their values. Do not mix a legacy aggregate-only value into an individual-rating mean; it is a display fallback only when no individual source or user ratings exist.
- Local Compose ingress is loopback HTTP; demo ingress is HTTPS. Neo4j remains private. Raw/prepared dataset files remain local and mounted read-only for import.
- Implementation still needs to choose the Argon2id and Google verification packages, exact route names/status codes, concrete endpoint rate limits, and operational thresholds.
- Refresh the local prepared dataset and reimport before graph-level rating validation; the audited prepared snapshot lacked `ratings.csv`.

### UX Design Requirements

None. This is a backend-only scope; Android UX requirements are excluded.

### FR Coverage Map

- FR-13: Epic 1 — Stories 1.1, 1.2, 1.3, and 1.5 (account creation, password policy, verified access, and sign-in method conflicts)
- FR-14: Epic 2 — Story 2.1 (private rating creation, update, and removal)
- FR-15: Epic 2 — Stories 2.2 and 2.3 (favorite management, retrieval, and removal on account deletion)
- FR-16: Epic 2 — Story 2.3 (account deletion and rating anonymization)
- FR-17: Epic 1 — Story 1.1 (email verification)
- FR-18: Epic 1 — Story 1.3 (password recovery)
- FR-19: Epic 1 — Story 1.5 (Google sign-in and account conflict behavior)
- FR-20: Epic 2 — Story 2.1 (combined anonymous source and user ratings)
- FR-21: Epic 1 — Stories 1.2 and 1.4 (device sessions and token lifecycle)

## Epic List

### Epic 1: Secure Account Access Across Devices

People can create a password or Google account, verify or recover access, and manage signed-in sessions across devices.

**FRs covered:** FR-13, FR-17, FR-18, FR-19, FR-21

**Dependencies:** None; this epic establishes account identity and sessions for later capabilities.

### Epic 2: Rate and Save Recipes with Privacy

Account holders can manage recipe ratings and favorites; recipe details show combined anonymous ratings; account deletion removes personal data while retained ratings remain anonymous.

**FRs covered:** FR-14, FR-15, FR-16, FR-20

**Dependencies:** Epic 1 provides authenticated accounts and sessions. Graph-level rating validation also depends on refreshing and reimporting the local prepared ratings dataset.

## Epic 1: Secure Account Access Across Devices

People can create a password or Google account, verify or recover access, and manage signed-in sessions across devices.

### Story 1.1: Register and Verify a Password Account

As a new home cook,
I want to create and verify a password account,
So that I can securely access account features.

**Acceptance Criteria:**

**Given** a valid unique email, username, and password, **When** registration succeeds, **Then** the account is unverified, the password is stored as an Argon2id hash, and an eight-digit verification code is sent through Resend only after persistence commits; no password or raw code is returned or logged.

**Given** registration input, **When** it is validated, **Then** email is trimmed and case-folded, username is case-folded and limited to 3–30 ASCII letters, numbers, or underscores, and password length is at least 12 with no composition rules.

**Given** an email or username already in use, including a concurrent uniqueness race, **When** registration is attempted, **Then** the request returns the explicit duplicate result and creates no second account or verification email.

**Given** a verification code, **When** it is submitted, **Then** only the current unused code for that account can verify the email; it expires after 24 hours, allows at most five failed attempts, and consumption/attempt updates are atomic. Expired, wrong, reused, or exhausted codes return explicit safe errors.

**Given** a resend request for a known or unknown email, **When** processed, **Then** the public response does not reveal account existence; only a matching unverified account receives a replacement code, which invalidates the previous code, and issuance is throttled per account and IP.

**Given** a clean imported graph, **When** account services start, **Then** the separate idempotent account-schema migration verifies recipe import state, installs required uniqueness constraints, and gates API readiness; a stale Compose marker cannot make an empty graph appear imported.

**Given** the new account routes and migration, **When** checks run, **Then** existing recipe API behavior remains unchanged and relevant account, migration, privacy, and error cases are covered by tests.

### Story 1.2: Sign In and Start a Device Session

As a verified password-account holder,
I want to sign in and start a device session,
So that I can use protected account features on this device.

**Acceptance Criteria:**

**Given** a verified password account and correct credentials, **When** sign-in succeeds, **Then** the API creates an active device session and returns cryptographically random opaque access and refresh tokens; Neo4j stores only their hashes.

**Given** the issued tokens, **When** their lifetimes are checked, **Then** the access token expires after 15 minutes, the refresh token expires 30 days after issuance, and the session's 30-day idle window starts at sign-in.

**Given** session creation, **When** its record is stored, **Then** it includes device name and last-used time and is uniquely tied to the account; all required state is committed atomically before success is returned.

**Given** an unverified password account or invalid credentials, **When** sign-in is attempted, **Then** no session or token is issued and an explicit safe authentication error is returned.

**Given** a database or configuration failure, **When** sign-in cannot complete, **Then** the API reports an explicit failure rather than a success-shaped response; raw passwords/tokens are never logged.

**Given** sign-in routes are added, **When** API checks run, **Then** validation, session creation, token-hash persistence, error behavior, and existing recipe routes are covered.

### Story 1.3: Recover Password Access Safely

As a password-account holder who forgot my password,
I want to recover access without exposing account information,
So that I can regain control of my account securely.

**Acceptance Criteria:**

**Given** a recovery request for a known or unknown email, **When** processed, **Then** both receive the same public response; only the matching account receives an eight-digit single-use code.

**Given** a recovery challenge, **When** issued or resent, **Then** only one active code exists for that account/purpose; resend invalidates the previous code, delivery happens after persistence, and issuance is throttled per account and IP.

**Given** a recovery code, **When** submitted, **Then** it expires after one hour, allows at most five failed attempts, and is consumed atomically only once; wrong, expired, reused, or exhausted codes return explicit safe errors.

**Given** a valid recovery code and accepted new password, **When** reset commits, **Then** the password is replaced with an Argon2id hash using the shared 12-character minimum policy, the code is consumed, and every existing session is immediately revoked in the same transaction.

**Given** concurrent code submissions or a refresh/reset race, **When** operations contend, **Then** only one valid reset succeeds and no refresh can issue a token after reset has revoked the session.

**Given** email delivery, storage, or validation failure, **When** the request fails, **Then** errors are explicit, account-existence privacy is preserved, and raw codes/passwords are never logged or returned.

**Given** recovery routes are added, **When** API checks run, **Then** valid, invalid, expired, exhausted, reused, concurrent, and existing-session revocation cases are covered.

### Story 1.4: Manage Sessions Across Devices

As an account holder,
I want to inspect and end signed-in sessions,
So that I can revoke access from devices I no longer trust.

**Acceptance Criteria:**

**Given** an authenticated account, **When** I list sessions, **Then** I see only my sessions with device name, creation time, last-used time, and current-session indication.

**Given** a valid refresh token, **When** refresh succeeds, **Then** the current token is atomically consumed, exactly one replacement is issued, its 30-day expiry starts at issuance, and only its hash is stored.

**Given** a token that was already rotated out, **When** it is presented again, **Then** that session is atomically revoked and its access token is rejected on subsequent protected requests.

**Given** the current session or another listed session, **When** I sign out or terminate it, **Then** access and refresh are immediately invalidated; one account cannot terminate another account's session.

**Given** no successful refresh for 30 days or an expired access token, **When** protected access or refresh is attempted, **Then** the expired session/token is rejected and no credentials are returned.

**Given** concurrent refresh/reset/termination operations, **When** they contend, **Then** only one current-token rotation succeeds, and no refresh can issue credentials after revocation commits. Clients serialize refresh calls; a stale-token retry follows the reuse/revocation rule.

**Given** session routes and middleware are added, **When** API checks run, **Then** access control, token hashing/expiry, current/remote termination, replay, concurrency, and existing public recipe access are covered.

### Story 1.5: Create or Access an Account with Google

As a home cook,
I want to use my Google identity to create or access an account,
So that I can sign in without a password while retaining a distinct, verified account identity.

**Acceptance Criteria:**

**Given** a Google ID token, **When** the backend verifies it, **Then** signature, audience, issuer, and expiry are checked server-side; the verified `sub` is the stable provider identity and client-supplied claims are ignored.

**Given** a verified Google-authoritative Gmail or Workspace address with a hosted-domain claim, **When** a new account is created, **Then** it does not require separate email verification; other addresses require Resend verification before sign-in.

**Given** a new Google identity, **When** account creation proceeds, **Then** the person must choose a unique username after identity verification; a conflict leaves no partially created signed-in account.

**Given** the Google subject already belongs to an account, **When** its owner signs in, **Then** the existing account is accessed without creating a duplicate.

**Given** the Google email belongs to an account registered with another method, **When** sign-in is attempted, **Then** the API returns the explicit method conflict and does not link or merge accounts.

**Given** an invalid/expired token, username conflict, provider failure, or email-verification requirement, **When** the flow fails, **Then** no session is issued prematurely and errors do not expose credentials or raw tokens.

**Given** Google account routes are added, **When** API checks run, **Then** verified claims, email-authority cases, username selection, method conflicts, session issuance, and existing public recipe behavior are covered.

## Epic 2: Rate and Save Recipes with Privacy

Account holders can manage recipe ratings and favorites; recipe details show combined anonymous ratings; account deletion removes personal data while retained ratings remain anonymous.

### Story 2.1: Rate Recipes and See Anonymous Combined Ratings

As a home cook,
I want to rate a recipe and see how all anonymous ratings combine,
So that my experience contributes without exposing my identity.

**Acceptance Criteria:**

**Given** an authenticated account and an existing recipe, **When** I submit an integer rating from 1 to 5, **Then** one rating is created for my account/recipe; a later submission updates that same rating.

**Given** the rating owner, **When** they remove their rating, **Then** it no longer contributes to the recipe aggregate; another account cannot change or remove it.

**Given** source and user individual ratings, **When** a public recipe detail is read, **Then** the aggregate is the arithmetic mean of all 1–5 values, source 0 is excluded, and individual values/aggregate are returned without any user identity. Recipe details remain public.

**Given** a legacy aggregate without individual values or a source count, **When** a recipe has no individual ratings, **Then** it may be shown only as a display fallback; it is never combined into a mean once individual ratings exist.

**Given** concurrent rating writes by the same account, **When** they target one recipe, **Then** the unique account/recipe rating remains consistent and no duplicate is created.

**Given** graph-level rating tests, **When** run, **Then** the locally refreshed prepared dataset includes anonymous individual source ratings; contributor/rater identities remain absent, source/prepared files stay local, and none are committed or copied into application images.

**Given** rating routes and recipe detail changes, **When** API checks run, **Then** public-read privacy, authenticated writes, invalid values, update/removal, aggregate math, unavailable/not-found errors, and existing recipe behavior are covered.

### Story 2.2: Save, Remove, and Retrieve Favorite Recipes

As an account holder,
I want to save recipes and find them later,
So that my favorite recipes are easy to return to.

**Acceptance Criteria:**

**Given** an authenticated account and an existing recipe, **When** I add it as a favorite, **Then** one account/recipe favorite is stored; repeating the request does not create duplicates.

**Given** the owner of a favorite, **When** they remove it, **Then** it is no longer returned; another account cannot remove it.

**Given** an authenticated account, **When** it requests “My Recipes,” **Then** only that account’s saved recipes are returned with the recipe data required by the API.

**Given** an unauthenticated request or an unknown recipe, **When** favorite operations are attempted, **Then** the API returns an explicit safe authentication or not-found error and creates no state.

**Given** concurrent requests to favorite the same recipe, **When** operations contend, **Then** uniqueness and transaction handling leave one consistent favorite for the account and recipe.

**Given** favorite routes are added, **When** API checks run, **Then** add/remove/list, account isolation, idempotency, invalid/not-found behavior, and existing public recipe access are covered.

### Story 2.3: Delete an Account and Anonymize Ratings

As an account holder,
I want to delete my account and personal data,
So that I can leave the service without my identity remaining attached to ratings I contributed.

**Acceptance Criteria:**

**Given** an active authenticated session, **When** I request deletion of my own account, **Then** the service deletes that account’s personal account data, credentials/challenges, sessions, and favorites; another account cannot delete it.

**Given** the account has ratings, **When** deletion commits, **Then** all ratings remain queryable only as anonymous values: every owner link and account/recipe uniqueness key is removed, values continue to contribute to recipe aggregates, and no user identity is returned.

**Given** deletion races with refresh or another protected mutation, **When** operations contend, **Then** deletion and the operation serialize atomically against the live account/session; after deletion commits no session or protected mutation can succeed, and no account/favorite/rating ownership is recreated.

**Given** deletion cannot commit because of a storage failure, **When** the request fails, **Then** the transaction leaves account data, sessions, favorites, and rating ownership unchanged and the API returns an explicit failure.

**Given** account-deletion routes are added, **When** API checks run, **Then** deletion authorization, complete data removal, rating anonymity/aggregate retention, race behavior, rollback/error behavior, and existing public recipe access are covered.
