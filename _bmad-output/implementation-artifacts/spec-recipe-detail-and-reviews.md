---
title: 'Recipe Details and Imported Ratings'
type: 'feature'
created: '2026-11-04'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '96063d9db9e49e5cf21aeb1884ec8937d37e6574'
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/docs/prd.md'
  - '{project-root}/docs/architecture.md'
  - '{project-root}/docs/data-model.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Search results do not contain enough information to choose a recipe, and the app does not expose the dataset's existing ratings.

**Approach:** Let cooks open a recipe detail view that includes its instructions and all other available recipe information in the graph. Import and display the source's individual rating records when available; use an aggregate only if individual ratings are unavailable. Omit missing values instead of inventing them.

## Boundaries & Constraints

**Always:** Source details and ratings from the recipe dataset; preserve missing values as unavailable; do not expose contributor or rater identities. Follow the current `docs/prd.md` for feature scope and sequencing; do not create or modify OpenSpec artifacts for this feature.

**Never:** Add accounts, logins, user-submitted recipes, or user-submitted reviews. Do not fabricate recipe fields, instructions, or ratings.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Recipe details available | Cook opens a recipe from search results | Show its stored details, including ingredients, cuisine, cooking time, and instructions when available | N/A |
| Some detail fields absent | Stored recipe has missing or empty optional fields | Show available fields only; do not substitute invented values | N/A |
| Individual ratings available | Recipe has imported rating records | Show individual rating values without contributor or rater identity | N/A |
| Individual ratings unavailable | Source provides only an aggregate rating | Show the available aggregate; do not create individual records | N/A |
| No rating data | Recipe has neither individual nor aggregate ratings | Show an explicit no-ratings state | N/A |
| Unknown recipe | Requested recipe ID is not in the graph | Return a not-found response and show a useful not-found state | Do not return another recipe or success-shaped empty details |

</frozen-after-approval>

## Code Map

- `scripts/prepare-data.ts` and `scripts/prepare-data-cli.ts` -- normalize and write prepared recipe CSVs; currently project only name, ID, minutes, ingredients, and mapped cuisines, and do not process instructions or `RAW_interactions.csv`.
- `scripts/import-data.ts` -- validates prepared CSVs and imports nodes/relationships into a guarded fresh Neo4j graph; extend the prepared-data contract for detail and rating data without weakening the fresh-graph guard.
- `api/src/app.ts` -- registers `/api/recipes/search`; add a recipe-detail endpoint using the existing request/error conventions.
- `api/src/features/recipes/neo4j-recipe-search-repository.ts` and `recipe-search-types.ts` -- existing Neo4j recipe query and search result mapping; reuse the repository boundary and typed validation for detail reads.
- `web/src/features/ingredients/api.ts` and `web/src/app/App.tsx` -- validate search responses and render recipe cards; add a detail action and render the detail response using existing UI patterns.
- `tests/prepare-data.test.ts`, `tests/prepare-data-cli.test.ts`, `tests/import-data.test.ts`, API integration/search tests, and `tests/ingredient-ui.test.tsx` -- existing fixture and test surfaces for data contracts, graph/API behavior, and UI.
- `docs/data-preparation.md` and `docs/data-model.md` -- document the prepared fields, imported rating representation, and graph contract; update with the implementation.
## Tasks & Acceptance

**Execution:**
- [x] `scripts/prepare-data.ts`, `scripts/prepare-data-cli.ts`, and `docs/data-preparation.md` -- prepare source recipe instructions and `RAW_interactions.csv` rating values as validated graph-ready files while omitting absent values.
- [x] `scripts/import-data.ts` and `docs/data-model.md` -- validate and import detail and rating data without contributor/rater identities or changes to the fresh-database safety behavior.
- [x] `api/src/features/recipes/` and `api/src/app.ts` -- expose typed recipe detail and rating reads, including explicit not-found behavior.
- [x] `web/src/features/ingredients/api.ts` and `web/src/app/App.tsx` -- let users open recipe details from results and display available recipe fields and ratings with empty/missing states.
- [x] `tests/prepare-data.test.ts`, `tests/prepare-data-cli.test.ts`, and `tests/import-data.test.ts` -- cover available/missing instructions, individual/aggregate/absent ratings, prepared-data validation, and identity exclusion.
- [x] `tests/recipe-detail-api.integration.test.ts` -- cover detail/rating retrieval and unknown recipe IDs through the API and graph repository.
- [x] `tests/ingredient-ui.test.tsx` -- cover opening recipe details and available, missing, and empty rating states.

**Acceptance Criteria:**
- Given a recipe with stored instructions and other detail fields, when a cook opens it from search results, then the detail view shows those values for the selected recipe.
- Given missing optional fields, when recipe details are displayed, then missing values are omitted rather than fabricated.
- Given imported individual rating records, when the detail view is opened, then it displays individual rating values without contributor or rater identities.
- Given only aggregate rating data, when the detail view is opened, then it displays the available aggregate; given no rating data, it shows a no-ratings state.
- Given an unknown recipe ID, when details are requested, then the API returns not found and the UI does not present an empty or unrelated recipe as success.
- Given existing search behavior, when this feature is added, then ingredient search, ordering, filters, and pagination continue to work unchanged.

## Implementation Notes

## Verification

**Commands:**
- `npm test -- tests/prepare-data.test.ts tests/prepare-data-cli.test.ts tests/import-data.test.ts tests/recipe-search-api.integration.test.ts tests/recipe-search-types.test.ts tests/ingredient-ui.test.tsx` -- expected: all selected tests pass; use the repository's Neo4j integration configuration for graph-backed cases.
- `npm run check` -- expected: type, lint, and configured tests pass.

## Review Triage Log

The isolated review layers could not access the temporary diff file; direct review found and fixed the documentation issue below.

| Finding | Verdict | Evidence | Route |
|---|---|---|---|
| Fixture preparation example used project-wide mappings that rejected the synthetic fixture (`butter` was absent). | low | Running the documented command failed during category mapping; the fixture test exercises preparation with matching fixture mappings and passed. | patch — document the passing fixture test command instead. |
