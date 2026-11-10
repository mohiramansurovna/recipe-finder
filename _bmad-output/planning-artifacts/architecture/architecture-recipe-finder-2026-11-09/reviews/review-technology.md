# Technology Reality Review

**Reviewed:** 2026-11-09  
**Target:** `../ARCHITECTURE-SPINE.md`  
**Scope:** Repository version reality and compatibility of the implementation-constraining choices: Node.js, TypeScript, Express, Neo4j Community and its JavaScript driver/transactions, Resend, Google identity verification, and Argon2id.

## Conclusion

**The proposed target fits the existing stack.** The listed TypeScript, Express, and Neo4j JavaScript driver versions match the repository lockfile; the Node.js 22 and Neo4j 5.26 Community image tags match the existing container configuration. The Neo4j driver 6.x supports Neo4j 5.x, managed write transactions provide the required atomicity, and Community supports the uniqueness constraints the architecture specifies. No separate database or service is required by these choices, and no unrelated upgrade is indicated.

One material identity assumption needs qualification: Google does not treat every `email_verified: true` address as proof that the user currently controls that address. The selected Argon2id values are sound as the OWASP baseline, but should be attributed to OWASP rather than implied to be RFC 9106's parameter recommendation. Resend, a Google verification library, and an Argon2id package are not in the current dependency set; their integrations remain implementation choices, as the spine's Deferred section says.

## Version and compatibility check

| Spine entry | Repository evidence | Review |
|---|---|---|
| Node.js 22 (`node:22-bookworm-slim`) | Both stages of `api/Dockerfile` use that image. `package.json` and the lockfile root declare `node >=20`; README setup guidance says Node.js 20+. | Accurate as the container target, not a repository-wide exact runtime pin. The package contract intentionally allows later supported runtimes. Node's release page listed v22 as LTS when checked. |
| TypeScript 6.0.3 | `package.json` declares `^6.0.3`; `package-lock.json` resolves `typescript` to `6.0.3`. | Accurate. The Neo4j JavaScript Driver manual lists TypeScript 5.2 as its minimum, so 6.0.3 is within its documented range. |
| Express 5.3.0 | `package.json` declares `^5.3.0`; `package-lock.json` resolves `express` to `5.3.0`. | Accurate and compatible with the Node 22 container target. |
| Neo4j JavaScript driver 6.3.0 | `package.json` declares `^6.3.0`; `package-lock.json` resolves `neo4j-driver` to `6.3.0` and records Node.js `>=18`. | Accurate. Neo4j's Driver 6 manual says the 6.x series supports Neo4j 5.x; the repository's Node and database targets are within the documented range. |
| Neo4j 5.26 Community | `docker-compose.yml` and `docker-compose.demo.yml` both use `neo4j:5.26-community`. | Accurate. Neo4j documents 5.26 as an LTS release. |
| Argon2id, Resend, Google verifier | None is a dependency in the current package manifest/lockfile. | These are proposed integrations, not installed current-stack components. No package version can be verified yet; the spine correctly defers package choices. |

The Node image tag specifies a major line and Debian suite, not an immutable image digest or an exact Node patch. This is not a compatibility mismatch, but the table should be read as a target line rather than a fully reproducible runtime pin. Likewise, the lockfile resolves the existing npm packages; it does not select versions for the three deferred integrations.

## Findings

### 1. Qualify what a “verified Google email” establishes

**Location:** `AD-4 — Centralize credential and identity verification` (and the corresponding contract in PRD FR-19).

The rule that a verified Google email needs no separate verification is too broad if it means any Google token with `email_verified: true`. Google's Android backend-auth guidance says Google is authoritative for Gmail addresses, and for Workspace addresses when `email_verified` is true and the hosted-domain (`hd`) claim is present. For third-party addresses without `hd`, Google warns that a previously verified address may have changed owners and recommends another verification challenge. The token must also be verified for signature, audience, issuer, and expiry; Google's guidance recommends using a client library rather than implementing verification ad hoc. [G1]

**Implementation constraint:** define which Google email claims qualify to bypass email verification. Restrict the bypass to Google-authoritative addresses, or require a separate challenge for other addresses. Use the verified token's `sub` as the stable Google account identifier, not email; the spine already calls for a unique provider subject but should ensure the verifier contract supplies the validated subject and claims. Do not treat a third-party `email_verified` claim alone as proof of current mailbox control.

### 2. Attribute the Argon2id floor to the right guidance

**Location:** Stack table, `Argon2id | RFC 9106`; `AD-4` password-hashing rule.

The specified 19 MiB, two-iteration, parallelism-one values match the OWASP Password Storage Cheat Sheet's Argon2id minimum configuration. RFC 9106 specifies Argon2 (including Argon2id) and its parameter-selection guidance, but is not the source of that OWASP minimum. The values themselves are not a stack mismatch; the table's terse RFC citation can, however, be read as attributing the chosen floor to RFC 9106. [A1, A2]

**Implementation constraint:** retain the OWASP baseline as the stated policy and cite RFC 9106 as the algorithm specification. The Argon2id Node package is not yet selected or locked, so its Node 22/Linux compatibility and encoded-hash behavior remain to be verified. Benchmark hash latency and memory use in the API container and bound concurrent password-hash work; the memory cost multiplies with concurrent hashes.

## Verified design constraints (no mismatch found)

- **Community constraints:** Neo4j's property uniqueness constraints support single-property and composite uniqueness for nodes and relationships, so they can enforce unique email, username, provider-subject, and session/favorite/rating keys. Composite uniqueness is suitable for the account/recipe pair. The manual identifies property existence, type, and key constraints as Enterprise features; Community uniqueness does not require the constrained properties to exist. Therefore the design fits Community as written, provided required-property presence is enforced by the application/schema process rather than assumed to follow from uniqueness alone. Constraint creation scans existing data and requires the appropriate privilege, which supports the planned post-import migration but should be accounted for in migration readiness and startup timing. [N1, N2]
- **Managed transactions:** The JavaScript driver documents `Session.executeWrite()` managed transactions as atomic logical operations. It automatically retries transient failures, so transaction callbacks may run more than once and should be idempotent. Keeping Resend and Google calls outside the transaction, as AD-3 requires, is the correct boundary; keep other externally visible or non-repeatable work outside retryable callbacks as well. [T1]
- **Resend:** The adapter boundary fits a Node API. Resend's Node documentation requires an API key and verified sending domain and supports idempotency keys for duplicate-safe email retries. These are deployment/adapter prerequisites, not capabilities supplied by the existing lockfile. Persisting a credential before delivery and providing a recovery/retry path is consistent with the boundary; do not make email delivery part of a Neo4j transaction. [R1, T1]
- **Google verifier:** The server-side ID-token boundary fits the planned Android-to-backend flow. Google's Android guide explicitly requires sending an ID token over HTTPS and validating it server-side; it rejects trusting a client-supplied user ID. The exact Node library remains deferred, so its verification behavior must be checked against Google's required claims when selected. [G1]

## Sources

Repository configuration below was inspected on **2026-11-09**. Upstream documentation pages without a publication date are cited as accessed on that date.

### Repository

- `api/Dockerfile` (Node image for both stages); `docker-compose.yml` and `docker-compose.demo.yml` (Neo4j image tags).
- `package.json`, `package-lock.json` (declared ranges, resolved versions, and engine metadata); `README.md` (“Requirements” and “Checks”).
- `ARCHITECTURE-SPINE.md`, especially AD-3, AD-4, Stack, and Deferred; `docs/prd.md`, FR-19; `_bmad-output/specs/spec-account-backed-backend/SPEC.md`.

### Upstream

- **[NJS] Node.js Releases**, Node.js project, https://nodejs.org/en/about/previous-releases — v22 status and release information; accessed 2026-11-09.
- **[N3] Neo4j JavaScript Driver Manual — Installation**, https://neo4j.com/docs/javascript-manual/current/install/ — Driver 6.x server compatibility, Node LTS requirement, and TypeScript minimum; accessed 2026-11-09.
- **[T1] Neo4j JavaScript Driver Manual — Run your own transactions**, https://neo4j.com/docs/javascript-manual/current/transactions/ — ACID managed transactions and retry/idempotency behavior; accessed 2026-11-09.
- **[N1] Neo4j Cypher Manual — Constraints**, https://neo4j.com/docs/cypher-manual/current/schema/constraints/ — uniqueness versus Enterprise-only constraint types; accessed 2026-11-09.
- **[N2] Neo4j Cypher Manual — Create constraints**, https://neo4j.com/docs/cypher-manual/current/schema/constraints/create-constraints/ — composite uniqueness, absent-property behavior, privilege, and data-scan requirements; accessed 2026-11-09.
- **[N4] Neo4j Operations Manual — Installation**, https://neo4j.com/docs/operations-manual/5/installation/ — Neo4j 5.26 LTS listing; accessed 2026-11-09.
- **[R1] Resend — Send emails with Node.js**, https://resend.com/docs/send-with-nodejs — SDK prerequisites and idempotency; accessed 2026-11-09.
- **[G1] Google Identity — Authenticate to a backend server**, https://developers.google.com/identity/sign-in/android/backend-auth — ID-token verification, authoritative-email cases, and `sub`; accessed 2026-11-09.
- **[A1] RFC 9106, Argon2 Memory-Hard Function**, IRTF, September 2021, https://www.rfc-editor.org/rfc/rfc9106.html.
- **[A2] OWASP Password Storage Cheat Sheet**, https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html — Argon2id minimum parameters; accessed 2026-11-09.
