<!-- bmad:context -->
<!-- Verified 2026-11-10 against 6c215721a2725affab991b7d7912be1da4246f93. Managed by bmad-project-context; edits inside this block are replaced on refresh. Keep anything you want preserved outside the markers. -->

## recipe-finder

Recipe Graph is a private, first-party recipe-search backend with a native Android demo client. The backend uses Node.js 20+, TypeScript, Express, Neo4j, and Docker Compose. Product requirements live in `docs/prd.md`; use BMAD artifacts under `_bmad-output/` for scoped work. `README.md` is the setup and operations source.

## Policy

- Use BMAD for new scoped requirements and change planning. Continue an existing
  OpenSpec change only when explicitly requested, using its existing records
  without creating a competing plan. Before changing behavior, read
  `docs/prd.md`, the relevant BMAD spec (or existing OpenSpec artifact for an
  explicit legacy continuation), and `README.md`.
- Preserve API contracts, validation and error behavior, search ranking and cursor semantics, import safeguards, rate limits, and database privacy; add compatible routes or version breaking changes.
- Keep secrets, raw/prepared datasets, deployment state, and personal data out of Git. Use only synthetic disposable accounts with the public demo API.
- Do not provision billable AWS resources until the current README deployment review and explicit operator approval are complete; preserve SSH verification, cost confirmation, and teardown safeguards.

## Where things are

- API boundaries: `api/src/interface/http/` -> `api/src/application/` -> `api/src/core/` and `api/src/infrastructure/`; composition is in `api/src/app.ts` and `api/src/index.ts`.
- Data workflows are in `scripts/`; local and demo operations are documented in `README.md` and implemented in `scripts/demo-*.sh`, `docker-compose*.yml`, and `infra/`.
- Product scope: `docs/prd.md`; scoped BMAD artifacts: `_bmad-output/implementation-artifacts/`.

## Running and verifying

- Use Node.js 20+ and npm. Run `npm run check` before completing changes; while iterating, run the narrowest relevant tests.
- Read `README.md` before starting local Compose or running deployment commands; local email uses Mailpit, while demo email uses Resend.

## Conventions that differ from defaults

- Keep feature behavior in application services behind core contracts; routes do not query Neo4j or call providers directly. Adapters implement the ports and are wired at the composition root.

## Known pitfalls

- `docker compose down -v` deletes the local graph. Use it only when intentionally rebuilding from available prepared data; older graphs may need rebuilding to gain the graph-level import-completion record.

<!-- /bmad:context -->
