---
title: Recipe Graph Product Requirements
status: final
updated: 2026-11-09
---

# Recipe Graph Product Requirements

## 0. Document purpose

This PRD is the product-level source for Recipe Graph's goals, user outcomes, scope, and roadmap. It describes the implemented backend accurately, defines the planned account capabilities and the first-party Android client, records completed repository changes, and separates shipped capabilities from future product work. BMAD specs and planning artifacts define detailed, testable behavior. The README is limited to essential setup and operational instructions.

## 1. Vision

Recipe Graph helps a home cook decide what to make with ingredients already on hand. The product interprets ingredient phrases, makes the interpretation correctable, and finds recipes ranked by fit. Recipe details and cooking instructions let the cook decide whether a result is useful, and accounts let the cook save favorites and add their own ratings.

The current implementation is a backend API backed by a locally prepared recipe graph; the web client has been removed. The intended product is a private backend for a first-party native Android client written in Kotlin. Delivery is sequenced: the backend is completed first, including accounts, sessions, ratings, and favorites, and the Android client is started only after the backend is complete. The Android client lives in an `android/` folder of the same repository and is deliberately small: a home screen with favorites and filtered search, recipe details with rating, and a minimal account area.

## 2. Target user and journey

### 2.1 Target user

- **Home cook:** wants useful recipe ideas from ingredients available in their kitchen, with a way to save recipes they like and record their own ratings.
- **Project operator:** prepares the dataset, runs the backend and graph, and verifies changes without exposing database credentials or contributor information.

The API is for the first-party product, not a public third-party developer platform.

### 2.2 User journeys

- **UJ-1. Anna finds a recipe with what she has.** Anna opens the Android app and sees her favorite recipes. She types the ingredients she has into search; the app shows which terms it understood and which it did not, lets her correct them, and lets her narrow by excluded categories, cuisines, and cooking time; the app then replaces her favorites with matching recipes in ingredient-fit order. She opens a recipe to review its ingredients, cooking time, instructions, and ratings, and can rate it there. The backend already provides parsing, search, and detail; the Android client is specified in section 4.7.
- **UJ-2. Anna keeps a recipe she cooked.** Anna signs up with her email (or with Google), verifies her email address if she used a password, and signs in; she stays signed in on her phone until she signs out. After cooking a recipe, she saves it as a favorite, so it appears on the app's home screen. She rates the recipe with a star-style number on the same scale as the existing ratings; rating it again later updates her rating, and she can remove it. Other users see her rating as one more numeric rating without her identity. If she forgets her password she can recover it through an email sent to her. If she tries to sign in with a method different from the one she registered with, the app tells her which method to use. She can sign out or delete her account from the account area.

## 3. Glossary

- **Canonical ingredient:** the normalized ingredient name used by recipe search after alias or typo resolution.
- **Ingredient criteria:** included ingredients, excluded ingredients, excluded categories, and unrecognized terms derived from or edited after parsing.
- **Source rating:** an anonymous numeric rating originating in the imported recipe dataset. It is treated as the history of earlier user ratings.
- **User rating:** a rating authored by an account holder. The author can manage it privately; other users see numeric ratings without the author's identity. User ratings continue the source ratings on the same scale.
- **Favorite:** a recipe saved by an account holder for later access in “My Recipes.”
- **Session:** a signed-in period of one person on one device, kept alive by a refresh token and ended by sign-out, termination, or expiry.
- **Access token / refresh token:** a short-lived credential sent with API requests, and a longer-lived credential used only to obtain new access tokens.
- **Recipe graph:** recipe, ingredient, category, cuisine, alias, and source-rating data used by the backend.
- **Android client:** the first-party native Android application (Kotlin, Jetpack Compose) that consumes the backend API.

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

### 4.5 Accounts, sessions, ratings, and favorites — next (backend)

These capabilities are not implemented by the current backend and are the next work. Authentication and account data introduce new privacy and security responsibilities; their detailed requirements, architecture, and stories must be defined through BMAD before implementation. All of them are completed in the backend before Android work starts.

#### FR-13: Manage an account

A person shall be able to create and use an account with an email address, username, and password. Email and username shall be unique. Passwords shall be at least 12 characters with no composition rules. A password account shall be able to sign in only after its email address is verified (FR-17). If an email address already belongs to an account created with a different sign-in method, the API shall return an explicit error that names the existing method, and shall not link or merge accounts automatically.

#### FR-14: Manage private rating ownership

An authenticated account holder shall be able to rate a recipe and delete their own rating. A person shall have at most one rating per recipe: submitting a rating for a recipe they already rated shall update the existing rating rather than add another or fail. A rating is a whole-number star value from 1 to 5; it carries no text or comment. Any authenticated account holder may rate; there are no roles or additional permissions. The person's identity shall not be exposed with the rating to other users. Account-specific rating reads and all rating changes require authentication; public recipe details remain available and may show combined rating aggregates and identity-free individual values.

#### FR-15: Save and find favorites

An authenticated person shall be able to add and remove favorite recipes and retrieve their saved recipes in “My Recipes.” Account deletion shall remove favorites.

#### FR-16: Delete an account without identifying retained ratings

When an account is deleted, the system shall remove its favorites, sessions, and account data and retain any ratings only after removing their link to the deleted identity. The retained ratings shall remain anonymous.

#### FR-17: Verify email addresses

The backend shall send a verification message through Resend to the email address of a new password account and mark the address verified only when the person submits its valid, single-use, eight-digit code. Verification codes expire after 24 hours and allow at most five failed attempts. Only one code is active per account and purpose; resending invalidates the previous code. Initial registration sends and resends share rolling-hour limits of 3 per account and 10 per source IP.

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

### 4.7 Android client — after the backend is complete

The Android client is a native app written in Kotlin with Jetpack Compose, in the `android/` folder. Work on it starts only after the backend capabilities in section 4.5 are complete, so the client is built against a finished API. It covers UJ-1 and UJ-2, is intentionally small, and has no offline mode.

#### FR-22: Provide a native Android client

The product shall provide a native Android application that uses the backend API for ingredient interpretation, recipe search, recipe details, accounts, sessions, ratings, and favorites. The client shall not require backend changes beyond those in section 4.5.

#### FR-23: Home with favorites and search

The home screen shall have a search input. While the search input is empty, a signed-in person shall see their favorite recipes. When the person enters ingredient text and searches, the favorites shall be replaced by the search results; clearing the search shall bring the favorites back. A person who is not signed in shall see the search input and a prompt to sign in to see favorites, and shall keep full access to search and recipe details.

#### FR-24: Interpret and correct ingredients

The client shall submit the entered text for interpretation and display the returned included, excluded, excluded-category, and unrecognized criteria separately. The user shall be able to correct the criteria (for example remove a term or move it between included and excluded) before results are shown. Unrecognized terms shall be shown, never silently dropped.

#### FR-25: Browse ranked, filtered results with pagination

The client shall offer the excluded categories, cuisines, and supported maximum cooking times (15, 30, or 60 minutes) provided by the backend, and shall send the selected values with each search. It shall display results in the order returned by the API, showing for each recipe its name, cooking time when available, and matched and missing ingredient information. It shall show the total result count and load the next page using the returned cursor. Changing the ingredient criteria or any filter shall discard the current cursor and start a new search.

#### FR-26: Recipe details, rating, and favorite

Selecting a result or a favorite shall open the recipe's details: ingredients, cooking time, instructions, cuisines, and combined ratings, omitting or marking as unavailable any field the API reports as unavailable. On the same screen a signed-in person shall be able to set or change their rating, remove it, and add or remove the recipe from favorites. A person who is not signed in shall be asked to sign in before rating or favoriting.

#### FR-27: Account area

The client shall provide an account area where a signed-in person can sign out, delete their account (after an explicit confirmation), and change user settings. The first settings option is the theme (light, dark, or follow the system), stored on the device.

#### FR-28: Sign in

The client shall let a person sign up and sign in with email and password, and sign in with Google using the Android system sign-in, passing the resulting credential to the backend for verification (FR-19). The sign-in form shall show which method the person used last on this device, remembered only on the device. When the backend reports that the email belongs to an account created with another method, the client shall tell the person which method to use instead.

#### FR-29: Support email-based account flows

Verification and recovery emails are sent by the backend, not by the client. The client shall provide the screens and handling a person needs to request password recovery, complete it, and complete email verification (including asking for the email to be sent again), and shall show clear states when a credential is invalid or expired.

#### FR-30: Keep the session on the device

The client shall store its tokens securely on the device, refresh the access token automatically without asking the person to sign in again, and return to the sign-in screen only when the session can no longer be refreshed or was ended elsewhere. Managing other devices' sessions is not part of the first Android release.

#### FR-31: Handle loading and failure states

The client shall show distinct loading, empty-result, validation-error, service-unavailable, and not-found states, derived from the API's explicit error responses, and shall let the user retry after a failure. Raw error payloads and stack traces shall not be shown to the user.

#### FR-32: Provide dataset attribution

The client shall show the dataset attribution required by FR-9. The exact text and placement are an open question (section 9).

#### FR-33: Configure the backend connection safely

The backend base URL shall be configured per build type. Release builds shall use HTTPS only; cleartext HTTP shall be permitted only in debug builds for local development.

## 5. Non-goals

- A public third-party API.
- A web client in the cleaned-up repository.
- iOS or cross-platform clients (the first-party client is native Android).
- Offline use or local caching of recipes.
- Starting the Android client before the backend account, session, rating, and favorites capabilities are complete.
- A session-management screen and recommendations in the first Android release (the backend supports session management; the screen can be added to the client later).
- Automatic linking or merging of accounts that use different sign-in methods.
- Roles, permissions, or administrator features beyond having an account.
- Recommendation ranking or personalization rules before their basis is chosen.
- Contributor identities, public usernames on ratings, or user-submitted written reviews or comments.
- Runtime LLM calls or external recipe APIs.
- Nutrition or health advice.
- Production-scale infrastructure commitments.

## 6. Scope and roadmap

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

### Next: account-backed backend

The source-rating audit confirmed individual whole-number ratings from 1 to 5; 0 means unrated. Combine source and user ratings by pooling individual values and computing a count-weighted arithmetic mean. Specify and implement, in order of dependency: accounts with email verification and password recovery, device sessions with access and refresh tokens, Sign in with Google, one rating per user per recipe combined with source ratings, favorites and “My Recipes,” and account deletion. The backend is considered complete when all of section 4.5 passes its tests.

### Then: Android client

After the backend is complete, create the Android project in `android/` and build the client described in section 4.7: search flow and recipe details first (read-only), then sign-in and the session on the device, then ratings, favorites, the home favorites list, and the account area. Define detailed behavior through BMAD specs, architecture, and stories before implementation.

### Future discovery

Decide the basis for recommendations, and whether to add a session-management screen to the Android client.

## 7. Non-functional requirements

- **Privacy:** never persist or expose dataset contributor identities; keep account identity separate from ratings displayed to other users.
- **Security:** keep Neo4j private, protect credentials and deployment state, validate inputs, and rate limit API requests. Passwords shall be stored only as salted hashes and refresh tokens only in hashed form. Verification and recovery credentials shall be single-use, expiring, and limited in the number of attempts, and Google credentials shall be verified by the backend. The Android client shall keep tokens in secure device storage, and release builds shall communicate over HTTPS only.
- **Performance:** the existing project target is about one second for a typical first search page on demo hardware; this is an unvalidated target and must be measured before it is treated as an acceptance threshold. The Android client shall keep network calls off the main thread so the interface stays responsive while loading.
- **Reproducibility:** a clean checkout with local prepared data shall support the documented backend and graph setup, and the Android client shall build from a documented procedure.
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
- Email verification and password recovery work end to end with single-use, expiring credentials, and Google sign-in works end to end.
- A terminated session can no longer obtain new access tokens, and reuse of an already rotated refresh token ends its session.
- Signing in with a method that differs from the account's registered method returns an error naming the correct method.
- The first-page performance target is benchmarked on a defined dataset and environment before being adopted as a release threshold.
- A user can complete UJ-1 and UJ-2 end to end in the Android client against the demo or a local backend.
- The Android client shows a clear, specific state for each failure mode in FR-31.

## 9. Open questions

1. What recommendation inputs and ranking basis best serve the product?
2. What minimum Android version, device types (phones only or tablets too), screen designs, and further accessibility requirements apply to the Android client?
3. What dataset license attribution text and placement should the Android client use?