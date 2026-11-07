# Agent guidance

- Treat this as an existing application. Verify behavior in the current code;
  do not apply the historical greenfield scaffold instructions.
- Use BMAD exclusively for scoped requirements and change planning.
- Read `docs/prd.md`, the relevant BMAD spec, and the setup/operations
  guidance in `README.md` before changing behavior.
- Run `npm run check` for completed changes, or the narrowest relevant tests
  while iterating.
- Keep secrets and raw/prepared dataset files local; do not commit them.
