---
title: Recipe Graph Product Requirements
status: final
updated: 2026-11-07
---

# Recipe Graph Product Requirements

## 0. Document purpose

This PRD is the product-level source for Recipe Graph's goals, user outcomes, scope, and roadmap. It describes the implemented backend accurately, records completed repository changes, and separates shipped capabilities from future product work. Active OpenSpec specifications define detailed, testable behavior; archived OpenSpec changes preserve history. The README is limited to essential setup and operational instructions.

## 1. Vision

Recipe Graph helps a home cook decide what to make with ingredients already on hand. The product interprets ingredient phrases, makes the interpretation correctable, and finds recipes ranked by fit. Recipe details and cooking instructions let the cook decide whether a result is useful.

The current implementation is a backend API backed by a locally prepared recipe graph; the web client has been removed. The intended product is a private backend for a future first-party mobile client; this PRD does not define or commit to mobile implementation details.

## 2. Target user and journey

### 2.1 Target user

- **Home cook:** wants useful recipe ideas from ingredients available in their kitchen, with a way to save recipes they like and record their own ratings.
- **Project operator:** prepares the dataset, runs the backend and graph, and verifies changes without exposing database credentials or contributor information.

The API is for the first-party product, not a public third-party developer platform.

### 2.2 User journeys

- **UJ-1. Anna finds a recipe with what she has.** Anna has no idea what to cook. She enters her available ingredients; the product identifies the terms it understands and returns matching recipes in ingredient-fit order. She opens a recipe to review its ingredients, cooking time, and instructions. The current backend provides the parsing, search, and detail capabilities; a future mobile surface is not specified here.
- **UJ-2. Anna keeps a recipe she cooked.** After cooking a recipe, Anna saves it as a favorite and can find it later in “My Recipes.” She can submit a rating without attaching her identity to the rating shown to other users. If signed in, she can edit or remove her own rating.

## 3. Glossary

- **Canonical ingredient:** the normalized ingredient name used by recipe search after alias or typo resolution.
- **Ingredient criteria:** included ingredients, excluded ingredients, excluded categories, and unrecognized terms derived from or edited after parsing.
- **Source rating:** an anonymous numeric rating originating in the imported recipe dataset.
- **User rating:** a rating authored by an account holder. The author can manage it privately; other users see numeric ratings without the author's identity.
- **Favorite:** a recipe saved by an account holder for later access in “My Recipes.”
- **Recipe graph:** recipe, ingredient, category, cuisine, alias, and source-rating data used by the backend.

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

The API shall return anonymous individual source-rating values when available; otherwise it shall return the source aggregate when available. It shall not return contributor or rater identities.

### 4.3 Dataset preparation and privacy

The current data pipeline prepares graph-ready recipe, ingredient, category, cuisine, alias, and anonymous rating values from the pinned Food.com dataset and imports them into a fresh graph. Raw and prepared dataset files are local-only.

#### FR-7: Prepare and import graph data safely

The preparation and import workflow shall validate required data, report invalid or excluded records, preserve valid cooking-time values, and refuse to load into a non-empty graph. Missing or invalid optional values shall remain unavailable rather than being fabricated.

#### FR-8: Exclude source identities

Contributor and rater identity fields, review text, and unrelated personal data shall not be written to prepared output or stored in the graph. Source ratings may be retained only as anonymous numeric values.

#### FR-9: Protect dataset handling

Raw and prepared dataset files, credentials, and deployment state shall remain untracked and shall not be included in published application images. The first-party client shall provide the dataset attribution required by its terms.

### 4.4 API reliability and maintainability

The backend exposes a health endpoint, validates request shapes and filter values, applies API rate limiting, and reports validation, unavailable-service, and not-found failures using explicit responses. Ingredient and recipe application services, domain behavior, repository ports, Neo4j adapters, HTTP routing, and error handling have separate boundaries so they can be tested independently; account-backed capabilities remain future work.

The temporary HTTPS demo publicly exposes unauthenticated API requests for demonstration only; it does not provide production access control.

#### FR-10: Preserve explicit API behavior

Invalid requests and cursors shall receive client errors; unavailable graph operations shall not be reported as successful results. The API shall apply rate limits and shall not expose database access publicly.

#### FR-11: Organize backend code around stable boundaries

The backend shall be organized so ingredient, recipe-search, recipe-detail, and future account capabilities can evolve without unrelated feature changes. Domain and application behavior shall be independently testable from HTTP transport and graph persistence. Existing API behavior shall remain covered by unit and integration tests during the reorganization.

#### FR-12: Keep the repository backend-only

The web interface and its dedicated build, tests, and deployment wiring have been removed. The backend and data-preparation workflow remain runnable independently, and retained demo deployment operates without building or serving a web client.

### 4.5 Accounts, ratings, and favorites — planned

These are future capabilities and are not implemented by the current backend. Authentication and account data introduce new privacy and security responsibilities; their detailed contracts must be specified before implementation.

#### FR-13: Manage an account

In a future authenticated product, a person shall be able to create and use an account with an email address, username, and password. Authentication and account-management behavior is not yet specified.

#### FR-14: Manage private rating ownership

An authenticated person shall be able to add, edit, and delete their own rating for a recipe. The person's identity shall not be exposed with that rating to other users. The system shall combine user ratings with imported source ratings without publishing reviewer identities.

#### FR-15: Save and find favorites

An authenticated person shall be able to add and remove favorite recipes and retrieve their saved recipes in “My Recipes.” Account deletion shall remove favorites.

#### FR-16: Delete an account without identifying retained ratings

When an account is deleted, the system shall remove its favorites and account data and retain any ratings only after removing their link to the deleted identity. The retained ratings shall remain anonymous.

### 4.6 Recommendations and mobile — future exploration

Recommendations are a possible future capability, but the recommendation basis, ranking behavior, and success criteria are undecided. Mobile is the future first-party surface, but its journeys and requirements are outside this PRD's current scope.

## 5. Non-goals

- A public third-party API.
- A web client in the cleaned-up repository.
- Mobile implementation or mobile-specific UX requirements in this PRD.
- Recommendation ranking or personalization rules before their basis is chosen.
- Contributor identities, public usernames on ratings, or user-submitted written reviews.
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
3. Consolidated guidance into this PRD, active OpenSpec specs, archived OpenSpec history, and the essential README. The README and executable checks retain demo security and teardown safeguards.
4. Updated active OpenSpec requirements to reflect backend-only behavior; archived changes remain unchanged.

### Later: account-backed personal features

Define authentication and account lifecycle behavior, then implement private rating ownership, favorites, and “My Recipes.” Keep ratings shown to other users anonymous. Specify how imported source ratings and user ratings are aggregated before implementing a combined score.

### Future discovery

Decide the basis for recommendations and define the first-party mobile experience before planning those capabilities.

## 7. Non-functional requirements

- **Privacy:** never persist or expose dataset contributor identities; keep account identity separate from ratings displayed to other users.
- **Security:** keep Neo4j private, protect credentials and deployment state, validate inputs, and rate limit API requests. Any future account capability must protect passwords and authenticated user data.
- **Performance:** the existing project target is about one second for a typical first search page on demo hardware; this is an unvalidated target and must be measured before it is treated as an acceptance threshold.
- **Reproducibility:** a clean checkout with local prepared data shall support the documented backend and graph setup.
- **Testability:** parsing shall have unit coverage; search and detail behavior shall have API and graph integration coverage; API behavior shall remain verified during structural changes.
- **Data governance:** prepared data shall contain only fields needed by the product, and raw/prepared dataset files shall not be committed.
- **Accessibility:** when a first-party client is designed, ingredient criteria and available actions must be operable with assistive technology and keyboard input. Detailed mobile accessibility requirements are deferred.

## 8. Success measures

- All shipped backend endpoints have contract tests for valid, invalid, unavailable, and not-found behavior where applicable.
- Search results satisfy the documented ranking and cursor rules across filtered pages.
- Ingredient parsing remains deterministic and reports unmatched terms instead of dropping them.
- The cleanup leaves no web-client build or deployment dependency, while the API and data workflow still pass the project check suite.
- No contributor identity appears in prepared output, graph detail responses, or ratings shown to other users.
- The first-page performance target is benchmarked on a defined dataset and environment before being adopted as a release threshold.

## 9. Open questions

1. How should imported source ratings and account-holder ratings be combined into the rating data shown for a recipe?
2. Should an account require email verification, and what password recovery and session-management behavior is needed?
3. Is there one active user rating per recipe, and what rating scale and validation rules should apply?
4. What recommendation inputs and ranking basis best serve the product?
5. What mobile user journeys, platforms, and accessibility requirements should be specified?
6. What dataset license attribution text and placement should the eventual first-party client use?
7. What API compatibility and versioning guarantees will the backend need to provide for first-party mobile clients?
