# BMAD Planning Roadmap

Use BMAD artifacts as the active requirements and delivery plan for this work. This roadmap sequences the next planning steps; it does not authorize implementation before decisions and stories are ready.

1. **Audit source ratings.** Verify imported rating values, scale, and available counts before deciding user-rating validation or aggregation. Keep raw and prepared data local; record only the findings needed for the decision.
2. **Resolve open questions.** Update this spec and, where needed, the PRD with decisions about source-rating aggregation, token lifetimes and inactivity expiry, email delivery and verification/recovery UX, and mobile API compatibility.
3. **Define architecture.** Use `bmad-architecture` to document account, credential, session, rating, and favorite boundaries and their fit with the existing backend.
4. **Create epics and stories.** Use `bmad-create-epics-and-stories` to turn the capabilities into dependency-ordered, independently verifiable slices. Keep source-rating findings and security/privacy constraints in the spec and architecture, not only in dispatch notes.
5. **Plan the sprint.** Use `bmad-sprint-planning` to validate readiness and sequence implementation work.
6. **Implement and verify.** Use `bmad-build` for each approved story; verify authentication, privacy, error behavior, and existing API behavior.
7. **Begin Android work only after backend completion.** Revisit the product PRD and create a separate BMAD spec and stories for the Android client after this backend scope meets the success signal in `SPEC.md`.
