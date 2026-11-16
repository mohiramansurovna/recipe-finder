---
title: Recipe Graph Product Requirements
status: final
updated: 2026-11-10
---

# Recipe Graph Product Requirements

## 0. Document purpose

This PRD is the product-level source for Recipe Graph's goals, user outcomes, scope, and roadmap. It describes the implemented backend accurately, defines the planned account capabilities and the first-party Android client, records completed repository changes, and separates shipped capabilities from future product work. BMAD specs and planning artifacts define detailed, testable behavior. The README is limited to essential setup and operational instructions.

## 1. Vision

Recipe Graph is a hobby project whose Android app demonstrates ingredient-based recipe discovery to internal staff. A staff member creates and verifies a demo account, signs in, enters available ingredients, reviews the parsed ingredients, and searches the recipe graph. The app presents matching recipes, detailed cooking information, anonymous ratings, and favorites, with account and theme controls in one place.

The backend API and locally prepared recipe graph provide the existing ingredient parsing, search, and recipe details; the account-backed capabilities are also implemented: registration, verification, password sign-in with device sessions, recovery, Google sign-in, anonymous ratings, favorites, and account deletion (contract in `docs/api-contract.md`). The native Android client is developed in parallel against that contract. The Android client will use Kotlin, follow the approved Figma design, and remain a small demo app. The public demo is not access-controlled, so only synthetic disposable accounts may be used there.

## 2. Target user and journey

### 2.1 Target user

- **Internal staff member:** uses the Android demo to register, verify an email, sign in, find a recipe from available ingredients, inspect its details, and try favorites and ratings.
- **Project operator:** prepares the dataset and runs the backend and graph without exposing database credentials, contributor information, or real personal data through the public demo.

The API is for the first-party product, not a public third-party developer platform.

### 2.2 User journeys

- **UJ-1. Ann onboards and finds a recipe.** Ann, a staff member evaluating the demo, installs and opens the Android app, creates an account with a disposable email, enters the emailed verification code, then signs in. She opens Search, types the ingredients she has into one input, reviews the parsed ingredient terms, and submits the search. Matching recipes appear; she opens one to inspect its ingredients, cooking steps, and ratings, then adds it to Favorites and submits a rating. The journey succeeds when she can identify a recipe to try without losing unrecognized ingredient terms.
- **UJ-2. Ann manages her demo account.** Ann opens Favorites from the app navigation to revisit a saved recipe. In Account, she checks her account information, selects light, dark, or system theme, or logs out to clear this device's session. If she chooses Delete account, the app explains the effect and asks her to confirm separately; after confirmation, her account and favorites are deleted while any retained ratings no longer identify her.

## 3. Glossary

- **Canonical ingredient:** the normalized ingredient name used by recipe search after alias or typo resolution.
- **Ingredient criteria:** included ingredients, excluded ingredients, excluded categories, and unrecognized terms derived from or edited after parsing.
- **Source rating:** an anonymous numeric rating originating in the imported recipe dataset. It is treated as the history of earlier user ratings.
- **User rating:** a rating authored by an account holder. The author can manage it privately; other users see numeric ratings without the author's identity. User ratings continue the source ratings on the same scale.
- **Favorite:** a recipe saved by an account holder for later access in “My Recipes.”
- **Session:** a signed-in period of one person on one device, kept alive by a refresh token and ended by sign-out, termination, or expiry.
- **Access token / refresh token:** a short-lived credential sent with API requests, and a longer-lived credential used only to obtain new access tokens.
- **Recipe graph:** recipe, ingredient, category, cuisine, alias, and source-rating data used by the backend.
- **Android client:** the first-party native Android application written in Kotlin that consumes the backend API.
- **Demo account:** a synthetic, disposable account used only to demonstrate the app; it must not contain real personal information.
- **Theme:** the device-local light, dark, or system appearance preference.

## 4. Product capabilities and requirements

### 4.1 Ingredient interpretation

The backend already parses ingredient text deterministically against graph vocabulary, curated aliases, supported categories, and conservative spelling matches. Parse results expose included, excluded, category-excluded, and unrecognized terms.

#### FR-1: Interpret ingredient text

The API shall return distinct included, excluded, excluded-category, and unrecognized criteria for submitted text. It shall resolve supported aliases and conservative, unambiguous single-edit spelling variants to canonical names, and shall not silently discard unmatched terms.

#### FR-2: Keep interpretation deterministic

Given the same text and vocabulary, ingredient parsing shall return the same result without runtime LLM or external API calls.

### 4.2 Recipe discovery and details

The backend already supports recipe search, filters, cursor pagination, and recipe detail retrieval. Search filters are applied before pagination. Selected cuisines use OR semantics; with cuisine filters selected, recipes without a matching selected cuisine are excluded. A selected excluded category excludes a recipe containing any ingredient in that category.

#### FR-3: Search by ingredient fit

The API shall accept included and excluded ingredients, excluded categories, selected cuisines, an optional supported maximum cooking time, and an optional cursor. Results shall be ordered by fewest missing ingredients, then most matched ingredients, then fewest excluded-ingredient matches, then stable recipe ID.

#### FR-4: Continue search consistently

The API shall return a cursor for subsequent pages. A cursor shall be bound to the canonical ingredient, category, cuisine, and cooking-time criteria; reusing it with different criteria shall return an explicit client error.

#### FR-5: Retrieve recipe details

The API shall return a requested recipe's ID, name, optional cooking time and instructions, ingredients, cuisines, and available ratings. It shall return an explicit not-found response for an unknown recipe. This capability is shipped; no additional detail fields are currently committed.

#### FR-6: Represent available source ratings

The API shall return anonymous individual source-rating values when available; otherwise it shall return the source aggregate when available. It shall not return contributor or rater identities. Once user ratings exist, FR-20 governs how they are combined with source ratings.

### 4.3 Dataset preparation and privacy

The current data pipeline prepares graph-ready recipe, ingredient, category, cuisine, alias, and anonymous rating values from the pinned Food.com dataset and imports them into a fresh graph. Raw and prepared dataset files are local-only.

#### FR-7: Prepare and import graph data safely

The preparation and import workflow shall validate required data, report invalid or excluded records, preserve valid cooking-time values, and refuse to load into a non-empty graph. Missing or invalid optional values shall remain unavailable rather than being fabricated.

#### FR-8: Exclude source identities

Contributor and rater identity fields, review text, and unrelated personal data shall not be written to prepared output or stored in the graph. Source ratings may be retained only as anonymous numeric values.

#### FR-9: Protect dataset handling

Raw and prepared dataset files, credentials, and deployment state shall remain untracked and shall not be included in published application images. The first-party client shall provide the dataset attribution required by its terms.

### 4.4 API reliability and maintainability

The backend exposes a health endpoint, validates request shapes and filter values, applies API rate limiting, and reports validation, unavailable-service, and not-found failures using explicit responses. Its code is divided into application services and parsing utilities (`api/src/application/`), contracts and recipe types (`api/src/core/`), Neo4j persistence and mapping (`api/src/infrastructure/`), and HTTP routes, schemas, and error handling (`api/src/interface/http/`). `api/src/app.ts` composes these pieces; `api/src/index.ts` starts and shuts down the API and database driver. Account-backed capabilities remain future work.

The temporary HTTPS demo publicly exposes unauthenticated API requests for demonstration only; it does not provide production access control. Once accounts ship, endpoints that read or change personal data (ratings, favorites, account, sessions) shall require authentication.

Keep existing `/api` routes stable and make compatible additions for first-party clients. Introduce a new API version only when a change cannot remain backward-compatible.

#### FR-10: Preserve explicit API behavior

Invalid requests and cursors shall receive client errors; unavailable graph operations shall not be reported as successful results. The API shall apply rate limits and shall not expose database access publicly.

#### FR-11: Organize backend code around stable boundaries

The backend shall keep application behavior, core contracts and types, persistence adapters, and HTTP transport in separate source areas so ingredient, recipe-search, recipe-detail, and account capabilities can evolve without unrelated feature changes. Existing API behavior shall remain covered by unit and integration tests.

#### FR-12: Keep the backend independent of any client

The web interface and its dedicated build, tests, and deployment wiring have been removed. The backend and data-preparation workflow shall remain buildable, testable, and runnable without the Android client, which lives in a separate `android/` folder of the same repository. The retained demo deployment shall operate without building or serving any client.

### 4.5 Accounts, sessions, ratings, and favorites

Registration, email verification, verification-code resend, password sign-in with device sessions, password recovery, Google sign-in, ratings, favorites, and account deletion are implemented by the backend; request and response contracts are in `docs/api-contract.md`. Password recovery and Google sign-in remain outside the Android demo scope. The Android client integrates against that contract.

#### FR-13: Manage an account

A person shall be able to create and use an account with an email address, username, and password. Email and username shall be unique. Passwords shall be at least 12 characters with no composition rules. A password account shall be able to sign in only after its email address is verified (FR-17). If an email address already belongs to an account created with a different sign-in method, the API shall return an explicit error that names the existing method, and shall not link or merge accounts automatically.

#### FR-14: Manage private rating ownership

An authenticated account holder shall be able to rate a recipe and delete their own rating. A person shall have at most one rating per recipe: submitting a rating for a recipe they already rated shall update the existing rating rather than add another or fail. A rating is a whole-number star value from 1 to 5; it carries no text or comment. Any authenticated account holder may rate; there are no roles or additional permissions. The person's identity shall not be exposed with the rating to other users. Account-specific rating reads and all rating changes require authentication; public recipe details remain available and may show combined rating aggregates and identity-free individual values.

#### FR-15: Save and find favorites

An authenticated person shall be able to add and remove favorite recipes and retrieve their saved recipes in “My Recipes.” Account deletion shall remove favorites.

#### FR-16: Delete an account without identifying retained ratings

When an account is deleted, the system shall remove its favorites, sessions, and account data and retain any ratings only after removing their link to the deleted identity. The retained ratings shall remain anonymous.

#### FR-17: Verify email addresses

The backend shall send a verification message through its configured email provider to the email address of a new password account and mark the address verified only when the person submits its valid, single-use, eight-digit code. Verification codes expire after 24 hours and allow at most five failed attempts. Only one code is active per account and purpose; resending invalidates the previous code. Initial registration sends and resends share rolling-hour limits of 3 per account and 10 per source IP.

#### FR-18: Recover passwords by email

A person who forgot their password shall be able to request recovery. The backend shall send an eight-digit, single-use recovery code through Resend to the account's email address; the code expires after one hour and allows at most five failed attempts. Only one code is active per account and purpose; resending invalidates the previous code. Code issuance shall be rate-limited per account and IP. A new password may be set only through a valid recovery code and shall follow the password policy in FR-13. The response to a recovery request shall not reveal whether an email address has an account. Setting a new password shall end the account's existing sessions.

#### FR-19: Sign in with Google

A person shall be able to create an account or sign in with Google and shall choose a unique username after identity verification. The backend shall verify the Google identity credential it receives from the client, including its signature, audience, issuer, and expiry, and shall not trust client-supplied identity claims. Use Google's stable subject claim as the provider identity. Gmail addresses and verified Workspace addresses carrying the hosted-domain claim shall not require a separate verification email; other addresses shall be verified through Resend. If the Google address already belongs to a password account, FR-13 applies: the API returns an explicit error naming the existing method instead of linking the accounts.

#### FR-20: Combine user and source ratings

User ratings shall be added to the existing recipe ratings as a continuation of the source ratings, on the same 1-to-5 whole-number scale. A recipe's individual ratings shall include its anonymous source ratings and user ratings, and its aggregate shall be the arithmetic mean of all those individual values, weighted by their counts. Source value 0 means unrated and is excluded. Public recipe details may return the aggregate and identity-free individual values. No user identity shall be exposed with a rating.

#### FR-21: Manage sessions across devices

Signing in shall create a session for that device and issue a 15-minute access token and a refresh token that expires 30 days after issuance. Refresh tokens shall rotate on use, with each replacement expiring 30 days after issuance; a session expires after 30 days without a successful refresh. Presenting a refresh token that was already rotated out shall end that session. A person shall be able to sign out of the current session, list their sessions with device name and last-used time, and end any other session, so that a terminated device can no longer obtain new access tokens. The server shall store refresh tokens only in hashed form.

### 4.6 Recommendations — future exploration

Recommendations are a possible future capability, but the recommendation basis, ranking behavior, and success criteria are undecided. Ratings and favorites are likely inputs and shall be considered when this is specified. Recommendations are not part of the first Android release.

### 4.7 Android client

The Android client is a small, native Kotlin app for internal staff demos. It may be designed and developed in parallel with remaining backend work, using the API contract as the integration boundary. Figma screens generated and approved by the user shall be the visual source of truth for implementation. [ASSUMPTION: The first demo targets phone-sized Android devices; tablet-specific layouts are out of scope.] The app requires network access.

#### FR-22: Provide a native Android client

The product shall provide a native Android application that uses the backend API for account access, ingredient interpretation, recipe search, recipe details, ratings, favorites, and account deletion. The Android UI shall match the approved Figma screens at the 393 × 852 dp reference size and adapt to 360 dp-wide phone displays without clipping content or actions.

#### FR-23: Navigate to search and favorites

The signed-in person shall be able to open Search and Favorites from persistent app navigation. Search shall provide one ingredient-text input and a clear action to continue to parsing. Favorites shall display recipes the person has saved and open a selected recipe's details. A person must sign in to use the Android demo.

#### FR-24: Interpret and correct ingredients

The client shall submit ingredient text for interpretation and display recognized and unrecognized terms before search. The person shall be able to remove or correct parsed terms before submitting the search. Unrecognized terms shall remain visible and shall never be silently dropped.

#### FR-25: Browse ranked results with pagination

After the person confirms the parsed ingredients and starts a search, the client shall display matching recipes in the order returned by the API. Each result shall show its name and available cooking-time and ingredient-fit information. If results are paginated, the client shall continue using the API's cursor and shall restart the search when its criteria change.

#### FR-26: Recipe details, rating, and favorite

Selecting a result or favorite shall open recipe details showing available ingredients, cooking time, cuisines, cooking instructions, and ratings. A signed-in person shall be able to submit, update, or remove their whole-number 1–5 rating and add or remove the recipe from favorites. The UI shall not associate a rating with the rater's identity when ratings are displayed to others.

#### FR-27: Account area

The Account area shall show the signed-in person's email address and username and offer light, dark, or system theme selection. The theme preference shall be stored on the device. Log out shall be separate from Delete account: logging out shall end the current session, clear this device's session and account data, and return to sign-in. Delete account shall require a separate explicit confirmation before requesting deletion.

#### FR-28: Sign in

The client shall let a person register with email, username, and password, verify their email with the code sent by the backend, and sign in with email and password. Password-account sign-in shall be unavailable until email verification succeeds. The client shall communicate the existing account password and verification policies and show explicit validation and authentication errors. This demo shall use synthetic disposable credentials only.

#### FR-29: Support email-based account flows

Verification emails are sent by the backend, not by the client. The client shall provide registration, code verification, and verification-code resend flows, with clear states for invalid, expired, or delivery-failed codes.

#### FR-30: Keep the session on the device

The client shall store session credentials securely on the device, refresh the session without asking the person to sign in again while the session remains valid, and return to sign-in when the session expires or is revoked. Logging out shall revoke the current session and clear locally stored session and account data. Managing other devices' sessions is not part of this demo.

#### FR-31: Handle loading and failure states

The client shall show distinct loading, empty-result, validation-error, service-unavailable, and not-found states, derived from the API's explicit error responses, and shall let the user retry after a failure. Raw error payloads and stack traces shall not be shown to the user.

#### FR-32: Provide dataset attribution

The client shall show the dataset attribution required by FR-9. The text and placement shall be confirmed against the dataset terms before the demo is shared.

#### FR-33: Configure the backend connection safely

The backend base URL shall be configurable for local and demo use. Any build using the publicly reachable demo backend shall use synthetic disposable accounts only and shall warn against entering personal data. Cleartext HTTP shall be limited to local development; network traffic to the demo shall use HTTPS.

## 5. Non-goals

- A public third-party API.
- A web client in the cleaned-up repository.
- iOS or cross-platform clients (the first-party client is native Android).
- Offline use or local caching of recipes.
- Google sign-in, password recovery, offline use, and local recipe caching in this Android demo.
- A session-management screen and recommendations in this Android demo.
- Automatic linking or merging of accounts that use different sign-in methods.
- Roles, permissions, or administrator features beyond having an account.
- Recommendation ranking or personalization rules before their basis is chosen.
- Contributor identities, public usernames on ratings, or user-submitted written reviews or comments.
- Runtime LLM calls or external recipe APIs.
- Nutrition or health advice.
- Production-scale infrastructure commitments.

## 6. Scope and roadmap

### Android demo MVP

The Android demo includes account registration and email verification, password sign-in, ingredient parsing and correction, recipe search and details, anonymous user ratings, favorites, account information, device-local theme selection, sign-out, and explicit account deletion. The core demo journey requires an authenticated synthetic account.

### Shipped backend baseline

- Ingredient vocabulary and category endpoints.
- Deterministic ingredient parsing, including aliases, conservative typo handling, category exclusions, and unrecognized terms.
- Recipe search with cuisine/category/time filters, fit ranking, page counts, and criteria-bound cursor pagination.
- Recipe detail API with ingredients, cuisines, instructions, and anonymous source ratings.
- Dataset preparation and guarded graph import.
- API validation, error responses, health check, and rate limiting.

### Completed: backend-only repository readiness

1. Removed web-only code and its tests/build/deployment paths while retaining the runnable API and data workflow.
2. Reorganized the API into maintainable feature, application, repository-port, adapter, transport, and error-handling boundaries; existing API behavior remains covered by tests.
3. Consolidated product guidance into this PRD and BMAD artifacts, with essential setup and operational instructions in the README. The README and executable checks retain demo security and teardown safeguards.
4. Updated active product requirements and project guidance to reflect backend-only behavior; historical artifacts remain unchanged.

### Completed: account-backed backend

Implemented: registration, verification, resend, password sign-in with rotating device sessions, recovery, Google sign-in, one rating per account per recipe combined with source ratings, favorites, and account deletion. The source-rating audit confirmed individual whole-number ratings from 1 to 5; 0 means unrated. Combine source and user ratings by pooling individual values and computing a count-weighted arithmetic mean. The Android client integrates against the request, response, and error contracts in `docs/api-contract.md`.

### In parallel: Android client

Create the Kotlin Android app in `android/` against the implemented backend contract. Use the approved Figma handoff as the visual reference. Validate the integrated registration, verification, sign-in, ingredient search, recipe detail, rating, favorites, theme, logout, and account-deletion flow end to end with synthetic accounts.

### Future discovery

Decide the basis for recommendations, and whether to add a session-management screen to the Android client.

## 7. Non-functional requirements

- **Privacy:** never persist or expose dataset contributor identities; keep account identity separate from ratings displayed to other users.
- **Security:** keep Neo4j private, protect credentials and deployment state, validate inputs, and rate limit API requests. Passwords shall be stored only as salted hashes and refresh tokens only in hashed form. Verification credentials shall be single-use, expiring, and limited in the number of attempts. The Android client shall keep session credentials in secure device storage and use HTTPS for the public demo. Because the demo API is publicly reachable without access control, only synthetic disposable accounts may be used there.
- **Performance:** the existing project target is about one second for a typical first search page on demo hardware; this is an unvalidated target and must be measured before it is treated as an acceptance threshold. The Android client shall keep network calls off the main thread so the interface stays responsive while loading.
- **Reproducibility:** a clean checkout with local prepared data shall support the documented backend and graph setup, and the Android client shall build from a documented procedure and use a configurable backend URL.
- **Testability:** parsing shall have unit coverage; search and detail behavior shall have API and graph integration coverage; account, session, rating, and favorite behavior shall have API tests including updating an existing rating and ending sessions; API behavior shall remain verified during structural changes. The Android client shall have unit tests for its state and error handling logic.
- **Data governance:** prepared data shall contain only fields needed by the product, and raw/prepared dataset files shall not be committed.
- **Accessibility:** the Android client's ingredient criteria and available actions shall be operable with TalkBack and have adequately sized touch targets. Further accessibility requirements are deferred.

## 8. Success measures

- All shipped backend endpoints have contract tests for valid, invalid, unavailable, and not-found behavior where applicable.
- Search results satisfy the documented ranking and cursor rules across filtered pages.
- Ingredient parsing remains deterministic and reports unmatched terms instead of dropping them.
- The cleanup leaves no web-client build or deployment dependency, while the API and data workflow still pass the project check suite.
- No contributor identity appears in prepared output, graph detail responses, or ratings shown to other users, and no user identity appears with a user rating.
- Rating the same recipe again updates the user's existing rating instead of adding a second one, and a user's rating changes the combined ratings shown for that recipe.
- Email registration and verification work end to end with single-use, expiring credentials.
- A terminated session can no longer obtain new access tokens, and reuse of an already rotated refresh token ends its session.
- The first-page performance target is benchmarked on a defined dataset and environment before being adopted as a release threshold.
- Staff can complete UJ-1 and UJ-2 end to end in the Android client using synthetic accounts against a local or demo backend.
- Android screens match the approved Figma reference at the target phone size and remain usable on narrower supported phones.
- Log out ends the current session and clears locally stored account data; account deletion remains a separate confirmed action.
- The Android client shows a clear, specific state for each failure mode in FR-31.

## 9. Open questions

1. What recommendation inputs and ranking basis best serve the product?
2. What minimum Android version will be supported? Decide during Android architecture based on the demo device and toolchain.
3. What dataset license attribution text and placement should the Android client use?
4. When will the user-generated Figma screen file be ready? It is required before pixel-fidelity implementation and review.

### Assumptions Index

- **A-1:** The first demo targets phone-sized Android devices; tablet-specific layouts are out of scope.