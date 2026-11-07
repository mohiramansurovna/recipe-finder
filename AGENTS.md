# Agent guidance

- Treat this as an existing application. Verify behavior in the current code;
  do not apply the historical greenfield scaffold instructions.
- Use `openspec/` as the canonical source for scoped requirements and change
  tracking. BMAD may support discovery and implementation, but should not
  create a competing requirements/specification set for the same change.
- Read `docs/prd.md`, the relevant active OpenSpec specifications, and the
  setup/operations guidance in `README.md` before changing behavior.
- Run `npm run check` for completed changes, or the narrowest relevant tests
  while iterating.
- Keep secrets and raw/prepared dataset files local; do not commit them.
