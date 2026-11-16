---
title: 'Native Android Client from Figma'
type: 'feature'
created: '2026-11-10'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '6c215721a2725affab991b7d7912be1da4246f93'
context:
  - '{project-root}/docs/prd.md'
  - '{project-root}/README.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-1-register-and-verify-a-password-account.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Recipe Finder has no Android app, so staff cannot use its ingredient search and recipe discovery journey from a phone.

**Approach:** Build the native Kotlin Android client represented by the supplied Figma file, matching the phone screens and adapting to 360 dp-wide devices. Connect implemented API flows and keep missing backend operations explicit rather than showing fabricated success.

## Boundaries & Constraints

**Always:** Use native Android Kotlin and the approved mobile Figma screens as visual source of truth. Keep API base URL configurable, use HTTPS for the demo, and use only synthetic disposable accounts there. Keep network work off the main thread; never persist passwords or verification codes. Preserve unrecognized ingredient terms and show distinct loading, empty, validation, unavailable, and not-found states. Do not expose rating identities. Wire only API operations implemented in this worktree: registration, verification/resend, ingredient parsing, search, and recipe detail. Until backend routes are available, sign-in/session, rating, favorites, account deletion, and logout must report unavailable without simulated success. Do not expose signed-in screens or protected operations to an unauthenticated person.

**Never:** Change backend behavior, commit secrets or dataset files, use production mock data, or implement Google sign-in, password recovery, offline recipe caching, tablet-specific layouts, or session management.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Registration and verification | Email, username, password, then emailed code | Submit to existing account endpoints; allow resend; after verification navigate to sign-in | Show validation, duplicate, expiry, delivery, and service errors explicitly |
| Sign-in and session-dependent actions | Sign-in, favorite, rating, logout, or delete while corresponding routes are absent | Keep the designed screen/action and report that the operation is not yet available; do not create a local or mock authenticated session | Clear unavailable state; do not enter protected flows |
| Ingredient search | Free-text ingredients, parsed criteria, optional edits | Preserve unknown terms; submit canonical criteria and show ranked/paginated API results | Allow correction/retry; do not silently discard terms |
| Recipe details | Selected result or favorite | Load recipe details and display available instructions, ingredients, cuisines, and anonymous ratings | Distinguish not-found from unavailable |

</frozen-after-approval>

## Code Map

- `api/src/interface/http/routes/accounts.routes.ts` and `api/src/interface/http/schemas/accounts.schemas.ts` -- Existing register, verify, resend request/response behavior and validation; no sign-in/session routes in this worktree.
- `api/src/interface/http/routes/ingredients.routes.ts` -- `POST /api/ingredients/parse` accepts `{ text }`; preserve included, excluded, category-excluded, and unrecognized criteria.
- `api/src/interface/http/routes/recipes.routes.ts` and `api/src/interface/http/schemas/recipes.schemas.ts` -- `POST /api/recipes/search`, `GET /api/recipes/:id`, explicit API error envelope, search cursor and validation contract.
- `api/src/core/recipes/recipes.types.ts` -- Search page and recipe-detail response shapes, including nullable time/instructions and anonymous ratings.
- `docs/prd.md` -- Current Android requirements FR-22 through FR-33, target 393 x 852 dp and 360 dp minimum width; it supersedes the older account-backend-only scope for parallel client development.
- `_bmad-output/specs/spec-account-backed-backend/SPEC.md` -- Account/session/rating/favorite/deletion requirements and constraints; route contracts remain unfinished.
- `_bmad-output/implementation-artifacts/spec-1-1-register-and-verify-a-password-account.md` -- Shipped registration/verification behavior and API errors.
- `README.md` -- API setup, local base URL, HTTPS demo warning, and synthetic-account requirement.
- Supplied Figma file, `qP5DLZjjPHBKhMvWG57O06` -- Mobile 393 x 852 screens for welcome, registration, verification, sign-in, search, results, recipe details, favorites, account, and visual/error variants. Implement main phone flows and relevant states, not unrelated desktop/tablet boards.
- No Android project, Gradle configuration, reusable UI library, or Android SDK/Java/Gradle toolchain exists in this worktree; create the client under `android/` and document its build/configuration.

## Tasks & Acceptance

**Execution:**
- [x] `android/` -- Create a native Kotlin/Jetpack Compose app, theme, navigation, and configurable development/demo API endpoints -- establish the project required by FR-22 and FR-33.
- [ ] `android/` -- Implement Figma-matched welcome, registration, verification, sign-in, search, results, recipe details, favorites, and account screens with responsive layouts -- cover the signed-in discovery journey and 360 dp width. Figma comparison and device-width checks remain blocked because the design handoff could not be retrieved.
- [x] `android/` -- Add typed API/data/repository boundaries for implemented backend routes and explicit unavailable states for unresolved contracts -- avoid fake success while backend work proceeds.
- [x] `android/` -- Implement input correction, ranking/pagination, loading/error/empty states, device-local theme preference, and accessibility behavior -- preserve the PRD's user and privacy guarantees without simulating unsupported sessions.
- [ ] `android/` -- Add focused unit/UI tests and setup instructions -- make screen state, error handling, API configuration, and build reproducible. Tests and instructions are present, but Android verification could not run because Java/Android SDK are unavailable in this environment.

**Acceptance Criteria:**
- Given a 393 x 852 dp phone, when the app is opened, then its in-scope screens match the corresponding Figma mobile layouts and navigation.
- Given a 360 dp-wide phone, when each screen is displayed, then content and primary actions remain visible and usable without horizontal clipping.
- Given registration, verification, parsing, search, and detail requests, when the API responds, then the app uses the documented contracts and presents loading, success, empty, validation, unavailable, and not-found states accurately.
- Given no sign-in/session API route, when sign-in is attempted, then the app reports unavailability and does not create a local identity or expose signed-in routes.
- Given parsed ingredients containing unrecognized terms, when criteria are reviewed or edited, then unmatched terms remain visible until the person removes or corrects them.
- Given paginated results, when the person requests more, then the same criteria and returned cursor are used; changing criteria restarts the search.
- Given a public demo build or account action whose API contract is unavailable, when configured or invoked, then the app warns to use synthetic credentials and never displays fabricated backend success.
- Given theme selection, when the choice is applied, then theme preference is device-local; password and verification-code input is never persisted.

## Implementation Notes

The Android project and API-backed flows are implemented. The sign-in/session-dependent screens remain gated because their backend routes are absent. API base URL configuration is via Gradle property `apiBaseUrl`; local cleartext is limited to emulator/localhost hosts. Dataset attribution wording remains pending confirmation against the source terms.

## Verification

**Commands:**
- `cd android && ./gradlew test --no-daemon` -- blocked: Java is not installed in this environment; Android unit tests were not run here.
- `cd android && ./gradlew connectedDebugAndroidTest --no-daemon` -- not run: requires Java, Android SDK, and an attached emulator/device.
- `npm run check` -- passed: lint, type-check, and Vitest (171 passed, 2 skipped).

**Manual checks:**
- Figma comparison at 393 x 852 dp and 360 dp, touch/keyboard checks, and emulator inspection remain unverified because the Figma MCP lookup timed out and no Android SDK/device is available.

## Review Triage Log

- **false — unauthenticated protected routes:** The reviewer cited an `isAuthenticated` guard that was not present. The routes now explicitly gate Search, Results, Details, Favorites, and Account behind unavailable session routes; the sign-in flow cannot set a local session.
- **false — missing screen-transition verification:** Android instrumentation tests now assert registration success navigation, registration failure behavior, and the unavailable sign-in gate; unit tests exercise parse correction, search cursor mapping, detail mapping, and API error distinction. Android tests remain separate from `npm run check` as required to keep backend checks independent of the client (PRD FR-12).
