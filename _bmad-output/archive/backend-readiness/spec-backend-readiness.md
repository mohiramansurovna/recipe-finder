---
title: 'Backend-Only Repository Readiness'
type: 'refactor'
created: '2026-11-07'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '86f89a1d336a2b1d0b892e609dd229c8285b8b45'
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/docs/prd.md'
  - '{project-root}/openspec/config.yaml'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The product requirements and repository docs are stale, the web client is no longer in scope, and the API code needs clearer boundaries before new features are added.

**Approach:** Reconcile the PRD and active OpenSpec specs with shipped backend behavior; remove the web client and its dedicated build/test/deploy wiring; retain a runnable, safely deployed API and data workflow; reorganize API responsibilities and consolidate noncanonical docs into essential README guidance. Preserve archived OpenSpec history.

## Boundaries & Constraints

**Always:** Keep current API contracts, search ranking/cursor semantics, data-import safeguards, rate limiting, database privacy, and demo security/teardown protections. Keep the API private for a future first-party mobile client. Keep OpenSpec as the canonical scoped change record.

**Never:** Do not implement mobile, authentication, user ratings/favorites, or recommendations in this cleanup. Do not rewrite archived OpenSpec changes, delete local/raw/prepared data, weaken deployment checks, expose Neo4j, or change behavior merely to move files.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Local API startup | Prepared data and credentials are available | Compose starts Neo4j/importer/API and exposes API through local Caddy without building a web client | Import and health failures remain explicit |
| Demo startup | API image and valid operator/demo configuration are available | Caddy serves the API over HTTPS; readiness checks exercise API health and search | Preserve security review, SSH, cost confirmation, and teardown gates |
| API compatibility | Existing requests and graph fixtures | Responses, validation, errors, search ordering, and cursor traversal remain unchanged | Existing failure contracts remain explicit |
| Retired web references | Build, test, deployment, docs, and specs are inspected | No active workflow depends on removed client assets or UI tests | Update affected checks rather than silently skipping them |

</frozen-after-approval>

## Code Map

- `docs/prd.md` -- updated product scope and status; finish by reconciling its implementation baseline and roadmap.
- `openspec/config.yaml` and `openspec/specs/{data-prep-and-import,ingredient-parsing-and-chips,recipe-search-and-results,local-compose-environment}/spec.md` -- remove greenfield assumptions and UI-only requirements from active records; preserve archive.
- `openspec/specs/demo-deployment/spec.md` -- preserve the API-only deployment contract, including image publication, secure ingress, launch gates, and teardown behavior.
- `web/`, `tests/ingredient-ui.test.tsx`, `vite.config.ts`, root `package.json`, `package-lock.json`, `tsconfig.json`, and `eslint.config.js` -- remove the client and client-only tooling while preserving API, lint, typecheck, and Vitest coverage.
- `docker-compose.yml`, `docker-compose.demo.yml`, `Caddyfile`, `Caddyfile.demo`, `.github/workflows/demo-deployment.yml`, `scripts/demo-{lib,up,smoke}.sh`, and deployment tests -- remove web image/assets and keep API-only local and demo ingress/readiness.
- `api/src/index.ts` -- validate environment settings and manage API/driver startup and shutdown; `api/src/app.ts` composes services, middleware, and routes.
- `api/src/application/`, `api/src/core/`, `api/src/infrastructure/`, and `api/src/interface/http/` -- separate application services/utilities, contracts and types, Neo4j persistence/mapping, and HTTP routing/schemas/errors.
- `tests/` API/parser/search/detail/integration suites -- preserve contracts, ranking, cursor, privacy, and graph mapping coverage.
- `README.md` -- retain only essential backend setup, data preparation pointer/commands, API verification, and safe demo launch/teardown guidance. Remove redundant architecture, data-model, preparation, deployment, and security-review docs only after their essential safeguards are represented in code, specs, or README.
- `specs/008-demo-deployment/` and stale `_bmad-output` recipe-detail records -- removed after the current deployment requirements were represented in OpenSpec and the recipe detail capability was reconciled in the current PRD/specs.

## Tasks & Acceptance

**Execution:**
- [x] `openspec/config.yaml` and active specs -- align project state and backend requirements; leave archived changes untouched.
- [x] `openspec/specs/demo-deployment/spec.md` -- retain the API-only deployment contract after removing the legacy duplicate specification set.
- [x] `web/`, root tooling, and UI tests -- remove client-only implementation and dependencies without removing API tooling.
- [x] Compose, Caddy, image workflow, deployment scripts, and tests -- keep local and demo API-only service healthy and protected.
- [x] `api/src/` -- organize application, core, infrastructure, and HTTP interface responsibilities while preserving API contracts.
- [x] `README.md` and `docs/` -- consolidate essential setup/security/teardown guidance, remove stale docs, retain `docs/prd.md`.
- [x] API and deployment tests -- verify removed-client assumptions are replaced by API-only assertions.

**Acceptance Criteria:**
- Given a clean checkout and local prepared data, when the documented startup is followed, then the API is reachable without building or serving a web client.
- Given valid demo configuration, when the demo is launched, then HTTPS proxies to the API and readiness checks confirm API health/search; security and teardown protections remain effective.
- Given existing API requests and graph fixtures, when the reorganized API handles them, then route contracts, errors, filters, ranking, cursor pagination, detail values, and data privacy are unchanged.
- Given the cleanup is complete, when tracked paths and active documentation are checked, then no web-client build/test/deployment dependency or stale greenfield/UI requirement remains, archived OpenSpec history is unchanged, and only the PRD, essential README, and OpenSpec records remain as project guidance.

## Implementation Notes

Keep changes in small dependency-ordered batches. The web and API work are coordinated by the shared contract and can be verified independently. Preserve demo safeguards in executable checks and concise README procedures before removing their current documentation.

## Verification

**Commands:**
- `npm run check` -- expected: lint, typecheck, and all applicable tests pass.
- `npm run build:api` -- expected: API build succeeds after file moves.
- `docker compose config` with required local values -- expected: API-only services render with no web service or asset volume.
- `python3 -c 'import yaml; ...'` for both Compose files -- expected: YAML parses; the Compose CLI is unavailable in this WSL environment.
- Targeted deployment tests and `bash -n scripts/demo-up.sh scripts/demo-down.sh scripts/demo-smoke.sh` -- expected: API-only readiness and valid shell syntax.

## Review Triage Log

| Reviewer finding | Verdict and route | Evidence |
|---|---|---|
| Blind hunter: demo deployment omitted `ratings.csv` from validation and transfer. | medium — patch | `import-data.ts` requires `ratings.csv`; the deployment preflight and transfer now include it, with regression coverage for missing and transferred files. |
| Blind hunter: GHCR publication did not ensure anonymous package pulls. | medium — patch | The workflow pushes images but package visibility is configured in GitHub; README now requires making both packages public before launch. |
| Blind hunter: readiness curls could outlive the 600-second deadline. | medium — patch | Both HTTPS probes now use bounded connect and total timeouts; the launch-path test verifies both arguments. |
| Blind hunter: the old review could pass after checking the new review item. | medium — patch | The gate now requires current review fields and renewed approval, and rejects the historical 2026-11-04 metadata. |
| Blind hunter: generic checkbox checks did not ensure required review items remained. | medium — patch | The gate matches each required checklist item exactly; a test verifies an unchecked required item blocks launch. |
| Blind hunter: malformed nonempty search results could pass the readiness smoke check. | medium — patch | The smoke check validates the API page and each recipe result shape; a malformed-result regression test fails. |
| Blind hunter: README omitted demo operator tools. | low — patch | README now lists the AWS, Terraform, Docker, SSH, rsync, curl, Git, and Node prerequisites used by deployment. |
| Blind hunter: current attribution obligations for the public demo API were unclear. | maybe-false — defer | The repository records future first-party attribution but does not include license terms that establish whether public API serving requires immediate attribution; verify the source terms and deployment model. |
| Blind hunter: README did not explain the configurable local ingress port. | low — patch | README now identifies `8080` as the default and documents `APP_PORT`. |
| Blind hunter: the unauthenticated HTTPS demo could be mistaken for a private API. | medium — patch | README now states that anyone reaching the public hostname can call the API, warns against sending secrets or personal data, and clarifies that only the API container port is not directly exposed. |
| Edge-case hunter: `docs/.memlog.md` remained outside the canonical guidance set. | low — patch | The duplicate decision log was removed; its product decisions remain in the PRD and active OpenSpec requirements. |
| Verification-gap reviewer: Caddy ingress lacked a direct end-to-end test. | false — reject | Although no test drives Caddy directly, demo readiness and the smoke check call health, filters, and search through the public HTTPS hostname; a broken route fails launch before `Demo ready` is printed. |
