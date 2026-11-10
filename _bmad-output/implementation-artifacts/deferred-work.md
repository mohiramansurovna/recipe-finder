- source_spec: `_bmad-output/implementation-artifacts/spec-backend-readiness.md`
  summary: Verify dataset attribution obligations for the public demo API.
  evidence: The demo API publicly serves recipe data, but the repository does not include the dataset license terms or establish whether API serving requires attribution. Review the license and distribution model before the next public demo or first-party client launch.
- source_spec: `_bmad-output/specs/spec-account-backed-backend/SPEC.md`
  summary: Add Google sign-in with verified identity credentials and explicit account-method conflicts.
  evidence: Split from account-backed backend delivery so password account lifecycle can be built first; Google sign-in depends on the shared account model.
- source_spec: `_bmad-output/specs/spec-account-backed-backend/SPEC.md`
  summary: Add revocable, rotating device sessions with session listing and remote termination.
  evidence: Split from account-backed backend delivery so password account lifecycle can be built first; token lifetimes and inactivity expiry remain undecided.
- source_spec: `_bmad-output/specs/spec-account-backed-backend/SPEC.md`
  summary: Add private user ratings and combine them with anonymous source ratings.
  evidence: Split from account-backed backend delivery so password account lifecycle can be built first; the source-rating scale and counts require an audit before rating behavior is finalized.
- source_spec: `_bmad-output/specs/spec-account-backed-backend/SPEC.md`
  summary: Add favorites and the account holder's My Recipes collection.
  evidence: Split from account-backed backend delivery so password account lifecycle can be built first; favorites depend on the shared account model.
- source_spec: `_bmad-output/specs/spec-account-backed-backend/SPEC.md`
  summary: Add account deletion and privacy-preserving cleanup of associated data.
  evidence: Split from account-backed backend delivery so password account lifecycle can be built first; deletion behavior must coordinate sessions, favorites, and retained anonymous ratings.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-register-and-verify-a-password-account.md`
  summary: Record reproducible provenance for the source-rating audit.
  evidence: The audit reports source and prepared recipe counts but has no source snapshot identifier or reproducible query/script; the local source dataset details are needed to make the counts independently verifiable.
