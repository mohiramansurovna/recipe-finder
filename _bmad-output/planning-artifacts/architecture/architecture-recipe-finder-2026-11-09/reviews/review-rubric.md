# Architecture Spine Rubric Review

**Subject:** `../ARCHITECTURE-SPINE.md` — Account-backed Backend  
**Review date:** 2026-11-09  
**Intent:** Validate the feature-level build substrate; no changes made to the spine.

## Verdict

The draft is a coherent, appropriately scoped substrate in most respects: it governs CAP-1 through CAP-7, names the existing modular-monolith boundaries, supplies actionable data, transaction, credential, session, rating, and API rules, and maps the capabilities to implementation layers. The dependency diagram agrees with the current source layout and composition roots. The lint pass reports no mechanical findings.

It is **not yet fully convergent**: the rating-read authentication boundary conflicts across the canonical inputs and the spine, and a password-policy divergence is claimed as prevented without a corresponding rule. The capability map also disagrees with decision bindings, and the deployment diagram conflates local HTTP with demo HTTPS. Resolve the findings below before using this as the sole build contract.

## Findings

### 1. High — Rating read access is unresolved across the spec and API contract

**Evidence:** The account SPEC requires authentication for endpoints that read or change rating data (`_bmad-output/specs/spec-account-backed-backend/SPEC.md:46`). The spine instead preserves public recipe discovery and scopes authentication to personal/rating operations (`ARCHITECTURE-SPINE.md:72-76`), while placing CAP-5 in the recipe-detail read model (`ARCHITECTURE-SPINE.md:144`) and keeping the existing recipe API public (`ARCHITECTURE-SPINE.md:147`). The PRD says recipe details return available ratings and existing source rating values are anonymous (`docs/prd.md:71-77`); FR-20 says individual values include user ratings, without identities (`docs/prd.md:147-149`). In the brownfield API, `GET /recipes/:id` returns the recipe detail without authentication middleware (`api/src/interface/http/routes/recipes.routes.ts:11-12,45-62`), and the detail includes rating values (`api/src/infrastructure/neo4j/repositories/recipes.neo4j.repository.ts:126-140`).

**Impact:** Independent implementers can either authenticate the existing detail route (breaking its public contract), or expose user-rating values through it despite the SPEC's broad authentication rule. The draft does not state whether anonymous aggregates/individual values are an explicit public exception or whether all rating reads are protected.

**Disposition:** Resolve in the canonical contract and make the spine explicit: distinguish owner-only rating management/private reads from any anonymous, identity-free rating fields in public recipe details; alternatively, specify that all rating payloads require authentication and define the compatibility consequence. Keep this boundary consistent across the SPEC, PRD, and AD-7/map.

### 2. Medium — AD-4 claims a password-strength guarantee it does not define

**Evidence:** AD-4 says it prevents “inconsistent password strength” (`ARCHITECTURE-SPINE.md:54-58`), but its rule fixes hashing parameters, credential-code behavior, verification, and Google identity checks—not a shared password acceptance policy (`ARCHITECTURE-SPINE.md:58`). The account SPEC requires salted hashes but does not state a password-strength rule (`_bmad-output/specs/spec-account-backed-backend/SPEC.md:42-45`); PRD FR-13 requires a password without defining such a rule (`docs/prd.md:119-121`).

**Impact:** The stated divergence remains possible between registration and password reset, and AD-4's `Prevents` claim is not enforceable from its `Rule`.

**Disposition:** Either remove password strength from the `Prevents` claim, or define the shared password validation policy (including registration and reset) in the canonical requirements and bind it here.

### 3. Medium — Capability-to-decision bindings are internally inconsistent

**Evidence:** AD-3's `Binds` list omits CAP-3 (`ARCHITECTURE-SPINE.md:48-52`), but the CAP-3 map row says AD-3 governs Google sign-in (`ARCHITECTURE-SPINE.md:142`). Conversely, AD-2 binds all capabilities (`ARCHITECTURE-SPINE.md:42-46`), while the map omits AD-2 from CAP-4 through CAP-7 (`ARCHITECTURE-SPINE.md:143-146`).

**Impact:** The map cannot reliably serve as the promised consistency checklist: it both assigns a decision outside its declared scope and omits a universally bound decision from some capabilities.

**Disposition:** Make the bindings and map agree, or explicitly define the map's “Governed by” column as a subset of primary decisions and ensure it does not list decisions whose `Binds` exclude that capability.

### 4. Low — Deployment topology does not distinguish local HTTP from demo HTTPS

**Evidence:** The deployment diagram labels the Caddy ingress “HTTPS” (`ARCHITECTURE-SPINE.md:112-117`) and the accompanying deployment prose applies to both Compose deployments (`ARCHITECTURE-SPINE.md:134`). The local Compose service publishes only port 80 on loopback (`docker-compose.yml:58-66`) and uses a `:80` Caddy site (`Caddyfile:1-3`); the demo Compose publishes ports 80 and 443 with a hostname-based Caddy site (`docker-compose.demo.yml:67-80`, `Caddyfile.demo:1-3`).

**Impact:** The seed can lead implementers or validators to assume local HTTPS where the documented local environment currently uses HTTP, or to miss the demo's distinct TLS behavior.

**Disposition:** Mark the ingress as environment-specific (local loopback HTTP; demo HTTPS), or explicitly state that introducing local HTTPS is an intended change.

## Rubric assessment

- **Feature scope and coverage:** Pass. The spine is explicitly scoped to CAP-1–CAP-7, includes a map for all seven capabilities, and defers Android client work consistently with the SPEC.
- **Decision quality:** Mostly pass. AD-1–AD-7 state bindings, prevented divergence, and enforceable rules; finding 2 is the exception. AD-3's state-transition rule is concrete, but its declared scope must be reconciled with the map.
- **Layer mapping and brownfield fit:** Pass for the application boundaries. The diagram and namespace conventions align with the README and existing code: `api/src/app.ts` composes services and HTTP routing (`README.md:7-19`, `api/src/app.ts:11-18,43-46`), and `api/src/index.ts` wires Neo4j repositories and starts the app (`api/src/index.ts:18-35`). Deployment depiction has the environment-specific gap in finding 4.
- **Constraints and conventions:** Generally aligned. Credential storage, anonymous ratings, API compatibility, validation, and rate limiting trace to the SPEC/PRD; finding 1 is the unresolved access-control exception.
- **Deferred decisions:** Mostly legitimate and bounded: provider/package selection, exact routes/status codes, per-endpoint limits, and scale targets can be resolved in implementation/deployment work (`ARCHITECTURE-SPINE.md:151-156`). The rating access boundary and password-strength claim are not safely deferred as written because they affect the current contract and decision enforceability.
- **Placeholders and mechanics:** No template placeholders or missing decision fields found. `uv run .agents/skills/bmad-architecture/scripts/lint_spine.py --workspace _bmad-output/planning-artifacts/architecture/architecture-recipe-finder-2026-11-09` returned `total_findings: 0`.

## Review basis

Reviewed the spine, account SPEC, PRD, README, current API composition/routes and rating read model, both Compose deployments and Caddyfiles, and the BMad architecture review gate and spine template. Findings are limited to the evidence-backed issues above.
