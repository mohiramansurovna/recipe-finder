# Epic 1 Context: Secure Account Access Across Devices

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Enable people to create password or Google accounts, verify or recover access, and manage active sessions across devices. This establishes secure, persistent account identity and session capabilities needed by later account features, without breaking the existing recipe API.

## Stories

- Story 1.1: Register and Verify a Password Account
- Story 1.2: Sign In and Start a Device Session
- Story 1.3: Recover Password Access Safely
- Story 1.4: Manage Sessions Across Devices
- Story 1.5: Create or Access an Account with Google

## Requirements & Constraints

- Normalize email by trimming and case-folding; usernames are case-folded and limited to 3–30 ASCII letters, numbers, or underscores. Reject duplicate email or username, including concurrent uniqueness races.
- Passwords require at least 12 characters with no composition rules. Use Argon2id with at least 19 MiB memory, two iterations, parallelism one, and fresh salts; store only password hashes. Choose and benchmark the Node.js package, and bound concurrent password hashing.
- Password accounts cannot sign in until verified. Verification and recovery use single-use eight-digit codes, with five failed attempts maximum; verification expires after 24 hours and recovery after one hour. Keep one active code per account and purpose; resend invalidates its predecessor. Throttle issuance per account and IP. Recovery and resend responses must not reveal account existence.
- Verify Google ID tokens server-side (signature, audience, issuer, and expiry) and use the verified stable subject, never client-supplied identity claims. Gmail and verified Workspace addresses with a hosted-domain claim are authoritative; other addresses require email verification. Require a unique, user-chosen username for a new Google account. Report method conflicts without automatically linking accounts.
- Access tokens expire after 15 minutes. Rotating refresh tokens expire 30 days after issuance; sessions expire after 30 days without a successful refresh. List sessions with device name and last-used time. Protected requests must validate the active session; sign-out, remote termination, and password reset revoke access immediately. Reuse of a rotated refresh token revokes its session. Store token hashes only, and require clients to serialize refresh calls.
- Preserve existing `/api` behavior, request validation, JSON error conventions, and rate limiting; add compatible routes and version only breaking changes. Test valid, invalid, concurrency, privacy, and regression behavior. Android/client work is outside this backend epic.

## Technical Decisions

- Keep the existing modular monolith and ports-and-adapters structure: HTTP routes and middleware call application services; services depend on core contracts; Neo4j, Resend, Google verification, and password hashing are outbound adapters. Wire implementations only at the composition root; routes do not call providers or query Neo4j directly.
- Neo4j is the sole datastore for account, credential, and session state. Enforce normalized identity and session uniqueness with graph constraints, and validate required properties in application code. Use managed, retry-safe transactions for account/challenge creation and consumption, session creation, refresh rotation, and revocation. Check active session and account state atomically for protected mutations.
- Run an idempotent account-schema migration after successful recipe import and before API startup. The migration verifies graph-level import completion and recipe schema; API readiness checks Neo4j connectivity and required account schema. Do not rely on an external Compose marker to establish import completion.
- Keep transaction callbacks free of provider calls and non-repeatable side effects. Persist challenge state before sending email, send only after commit, and report delivery failures explicitly so non-enumerating retry flows can recover. Use a stable provider idempotency key where supported.
- Preserve existing service, repository-port, Neo4j repository, and route naming conventions. Keep secrets in runtime environment configuration and never log raw passwords, codes, tokens, or provider credentials.

## Cross-Story Dependencies

- Story 1.2 password sign-in depends on the verified account lifecycle from Story 1.1.
- Story 1.4 manages sessions created by the sign-in flows in Stories 1.2 and 1.5; its rotation and revocation rules must also govern sessions revoked by Story 1.3 password reset.
- This epic has no dependency on another epic; it establishes account identity and sessions for later capabilities.
