# Recipe Finder Android Demo — Addendum

## Implementation and handoff context

- The user selected Kotlin for the native Android client and requested a minimal, suitable Android setup.
- The user approved Kotlin with Jetpack Compose as the native Android setup.
- Android UI work should proceed in parallel with the remaining backend work, using coordinated API contracts. The user selected a separate Git worktree for Android work; the `android/` project remains part of the same repository.
- The user requested a single Figma AI prompt under 2,000 words and approved the prompt direction. Once generated and approved, the Figma file is the visual source of truth for implementation and pixel-level review.
- The prompt's reference phone frame is 393 × 852 dp; support narrower phone layouts. Tablet behavior and the minimum Android version remain undecided.

## Demo safety

The current public HTTPS demo API is not access-controlled. Use synthetic disposable accounts only; never use staff personal email addresses, passwords, or other personal information against it. Prefer the local backend for any testing that requires real account data.

## Account behavior

Log out and Delete account are separate actions. Log out ends only the current device session and clears locally stored account/session data. Account deletion requires a separate explicit confirmation. Ratings displayed to others must not reveal the author's identity; account deletion removes the account link from retained ratings.

## Android integration handoff (2026-11-16)

- **Backend:** all account capabilities the Android demo needs are implemented on `main`. The request/response contract is `docs/api-contract.md`; internals are in `docs/backend-overview.md`.
- **Android worktree:** the client was started in a separate worktree (`../recipe-finder-ui`, branch `feat/figma-ui`) before sign-in, sessions, ratings, favorites, and deletion existed. Its Search, Results, Details, Favorites, and Account flows were therefore gated behind an explicit "unavailable" state. After rebasing onto `main`, wire those screens to the real routes and remove the gating; keep the rule that no fake local session or success is ever shown.
- **Client behavior to honor:** refresh once on `SESSION_EXPIRED` and then return to sign-in; refresh tokens rotate and must be replaced on every refresh; `DELETE /api/accounts/me` needs a JSON body; sign-out clears only the current device session.
- **Archived specs:** the implemented backend specs now live in `_bmad-output/archive/`. Any Android artifact that links to `_bmad-output/specs/` or `_bmad-output/implementation-artifacts/` for the account spec or Story 1.1 should point there instead.
- **Still open (need a human):** the approved Figma file, the minimum Android version, the dataset attribution wording, and a first real build and test run (the earlier environment had no Java or Android SDK).
