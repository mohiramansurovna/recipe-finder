# Tasks

## 1. Classification Data and Preparation

- [x] 1.1 Add curated ingredient-category and cuisine-tag mappings; extend preparation to validate and emit category and cuisine data, and cover mapped, unmapped, and invalid inputs with preparation tests. Verify with `npm test -- tests/prepare-data.test.ts tests/prepare-data-cli.test.ts`.
- [x] 1.2 Extend prepared-data validation and Neo4j import to load `IngredientCategory`/`IN_CATEGORY` and `Cuisine`/`IN_CUISINE` data; update import tests for valid and invalid references. Verify with `npm test -- tests/import-data.test.ts tests/import-data.integration.test.ts`.
- [x] 1.3 Document the new classification inputs, prepared outputs, and graph relationships in `docs/data-preparation.md` and `docs/data-model.md`. Verify the documented file and relationship names match the preparation and import contracts.

## 2. Ingredient Parsing and API Contracts

- [x] 2.1 Extend deterministic ingredient parsing to recognize supported category exclusions separately from ingredient exclusions; cover supported and unsupported categories in parser unit tests. Verify with `npm test -- tests/ingredient-parser.test.ts`.
- [x] 2.2 Expose available category and cuisine options and validate category/cuisine search criteria in the API; update API integration tests for valid, duplicate, unsupported, and malformed filters. Verify with `npm test -- tests/ingredient-api.integration.test.ts tests/recipe-search-api.integration.test.ts`.
- [x] 2.3 Update `docs/architecture.md` to document category parsing, filter-option discovery, and the search API criteria contract. Verify the documented flow matches the implemented routes and request fields.

## 3. Graph Search and Cursor Pagination

- [x] 3.1 Apply category exclusions and OR-based multi-cuisine filtering in Neo4j before paging while preserving existing ranking and exact-exclusion behavior; add graph integration cases for dairy, Vegetarian, multiple cuisines, and unclassified cuisines. Verify with `npm test -- tests/recipe-search.neo4j.integration.test.ts`.
- [x] 3.2 Include canonical category and cuisine criteria in cursor fingerprints and reject cursors reused with changed filters; update cursor tests. Verify with `npm test -- tests/recipe-search-cursor.test.ts tests/recipe-search-types.test.ts`.
- [x] 3.3 Update `docs/architecture.md` with graph filtering and cursor-reset behavior. Verify the documented filter semantics match the search and cursor tests.

## 4. Web Filters and Accessibility

- [x] 4.1 Add editable category-exclusion chips and a Vegetarian preset that selects meat and fish/seafood; cover removal, keyboard interaction, and result refresh in UI tests. Verify with `npm test -- tests/ingredient-ui.test.tsx`.
- [x] 4.2 Add accessible multi-select cuisine controls and include all category/cuisine values in the UI search key so edits restart pagination; cover selection, clearing, and stale-cursor prevention in UI tests. Verify with `npm test -- tests/ingredient-ui.test.tsx`.
- [x] 4.3 Update `docs/architecture.md` to describe the category and multi-cuisine controls and their search-reset behavior. Verify the docs match the implemented UI.

## 5. Integration Verification

- [x] 5.1 Run the full repository checks and production builds after all feature work. Verify with `npm run check && npm run build:web && npm run build:api`.
