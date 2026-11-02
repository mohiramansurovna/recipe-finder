# Proposal

## Why

Ingredient-first search currently supports exclusions only for named ingredients, so users cannot reliably express dietary constraints such as avoiding dairy or finding vegetarian recipes. Adding ingredient-category and cuisine filters delivers the R4 “Filters and substitutions” roadmap slice using the existing local recipe graph and search flow.

## What Changes

- Add deterministic ingredient-category metadata for dairy, nuts, meat, and fish/seafood, plus a Vegetarian preset that excludes meat and fish/seafood.
- Recognize broad category exclusions in ingredient text and make category criteria visible and editable alongside existing search criteria.
- Prepare and import cuisine classifications from recipe tags, and support selecting multiple cuisines when searching.
- Include category and cuisine criteria in search validation, filtering, and cursor identity so changing filters starts a fresh result sequence.
- Update the relevant data-model and architecture documentation and cover preparation, API, graph search, parsing, and UI behavior with tests.

**Non-goals:** recipe substitutions (planned in change 009), nutrition or health advice, inferred or runtime-generated classifications, changes to recipe ranking, personalization, and external services.

This is not a repository greenfield change: it adds category/cuisine data and filter controls to the existing preparation, import, parsing, API, search, and UI components.

## Capabilities

### New Capabilities

None. This change extends the existing capabilities that own data preparation, ingredient criteria, and recipe search.

### Modified Capabilities

- `data-prep-and-import`: Prepare and import ingredient-category and cuisine metadata needed by filters.
- `ingredient-parsing-and-chips`: Recognize broad category exclusions and expose category criteria for editing.
- `recipe-search-and-results`: Filter by ingredient categories and multiple cuisines, preserving cursor pagination semantics.

## Impact

- Data preparation and import: prepared CSV outputs, graph nodes/relationships, and validation.
- API: parse/search request and response contracts, ingredient/category vocabulary access, and cursor fingerprints.
- Web: category and cuisine filter controls integrated with the existing search and accessible criteria UI.
- Tests and docs: data pipeline, parser, API, Neo4j search, UI, data-model, and architecture coverage.

The change satisfies the PRD’s R4 Filters and substitutions roadmap slice, the ingredient-first discovery goals, reproducibility and testability requirements, and keyboard accessibility. It does not change the existing dataset attribution or contributor-identity protections.
