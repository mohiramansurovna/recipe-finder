# recipe-search-and-results Specification

## Purpose

Provides API search and recipe-detail behavior for ingredient criteria, transparent ranking, time limits, and cursor-based result pages.

## Requirements

### Requirement: Search recipes using ingredient criteria
The system SHALL return recipes with their matched, missing, and excluded ingredient details based on the submitted criteria.

#### Scenario: Search with included ingredients
- **WHEN** a user searches with included ingredients
- **THEN** each result identifies matched included ingredients, recipe ingredients missing from the included list, and any excluded ingredients it contains

#### Scenario: Browse with no included ingredients
- **WHEN** a user searches with no included ingredients
- **THEN** the system can return all recipes subject to the selected time limit and excluded-ingredient ranking

### Requirement: Rank recipes by ingredient fit
The system SHALL order recipes by fewest missing included ingredients, then most matched included ingredients, then fewest matched excluded ingredients, and finally by a stable recipe identifier.

#### Scenario: Order recipes with different ingredient fit
- **WHEN** recipes have different counts of missing, matched, or excluded ingredients
- **THEN** recipes are ordered by those counts in the stated priority

#### Scenario: Keep tied results in a stable order
- **WHEN** recipes have the same missing, matched, and excluded ingredient counts
- **THEN** they are ordered consistently by recipe identifier

### Requirement: Paginate search results with a cursor
The system SHALL return search results in cursor-based pages that preserve the ranking order and do not require offset pagination.

#### Scenario: Load the next page
- **WHEN** a user requests another page using the cursor from the current page
- **THEN** the system returns the next results in the same order without repeating results from the previous page

#### Scenario: Reject an invalid cursor
- **WHEN** a user requests a page with a malformed cursor or a cursor from different search criteria
- **THEN** the system returns a client error instead of silently restarting or returning an unrelated page

#### Scenario: Change search criteria
- **WHEN** the user changes ingredient criteria, category exclusions, the cuisine selection, or the time limit
- **THEN** the result list starts a new search and no cursor from the previous search is used

### Requirement: Exclude recipes matching ingredient categories
The system SHALL allow users to exclude recipes containing ingredients classified in selected supported categories.

#### Scenario: Exclude a selected category
- **WHEN** a user excludes a supported category such as dairy
- **THEN** recipes containing any ingredient classified in that category are omitted from results

#### Scenario: Apply the Vegetarian preset
- **WHEN** a user enables the Vegetarian preset
- **THEN** recipes containing ingredients classified as meat or fish/seafood are omitted from results

#### Scenario: Search without category exclusions
- **WHEN** a user has no category exclusions or dietary preset selected
- **THEN** category classifications do not remove recipes from results

### Requirement: Filter recipes by cuisine
The system SHALL allow users to filter recipes by one or more supported cuisines.

#### Scenario: Select multiple cuisines
- **WHEN** a user selects multiple cuisines
- **THEN** results include recipes classified in at least one selected cuisine

#### Scenario: Clear cuisine selections
- **WHEN** a user clears all cuisine selections
- **THEN** recipes are not restricted by cuisine

#### Scenario: Omit recipes without a selected cuisine
- **WHEN** a cuisine filter is active and a recipe has no matching cuisine classification
- **THEN** that recipe is omitted from results

### Requirement: Filter recipes by maximum cooking time
The system SHALL allow users to show recipes up to 15, 30, or 60 minutes, or choose Any time.

#### Scenario: Apply a maximum cooking time
- **WHEN** the user selects a 30-minute limit
- **THEN** results with unknown cooking time or a known cooking time greater than 30 minutes are omitted

#### Scenario: Include recipes with unknown time
- **WHEN** the user selects Any time
- **THEN** recipes with unknown cooking time remain eligible for results

### Requirement: Include criterion details in search results
The API SHALL return each result's recipe ID, name, optional cooking time, matched and excluded ingredients, and missing ingredients.

#### Scenario: Return a recipe search result
- **WHEN** a recipe is included in a search response
- **THEN** the response contains its ID, name, available cooking time, matched included ingredients, excluded ingredients it contains, and missing ingredients

### Requirement: Return the total number of matching recipes
The recipe-search response SHALL include the total number of recipes eligible for the submitted search after filter rules and before cursor pagination is applied.

#### Scenario: Return a total with the first result page
- **WHEN** a user submits a recipe search
- **THEN** the response includes the total number of eligible recipes, independent of the current page size and preserving the existing ingredient-based ranking rules

#### Scenario: Keep the total stable across cursor pages
- **WHEN** a user requests another page with a valid cursor for the same criteria
- **THEN** the response includes the same total match count as the first page

#### Scenario: Count only recipes allowed by active filters
- **WHEN** a search includes a time limit, ingredient-category exclusion, or cuisine selection
- **THEN** the total excludes recipes removed by those filters

#### Scenario: Return zero for an empty result set
- **WHEN** no recipes match the submitted criteria
- **THEN** the response includes a total match count of zero

### Requirement: Retrieve recipe details without contributor identities
The API SHALL return available recipe details and anonymous source-rating values without exposing contributor or rater identities.

#### Scenario: Retrieve a recipe with details and ratings
- **WHEN** a client requests an existing recipe
- **THEN** the API returns its ID, name, optional cooking time and instructions, ingredients, cuisines, and available anonymous ratings

#### Scenario: Prefer individual source ratings
- **WHEN** individual source-rating records are available
- **THEN** the API returns those numeric values and does not substitute the aggregate rating

#### Scenario: Use aggregate rating when individual values are unavailable
- **WHEN** no individual source-rating records are available and an aggregate rating exists
- **THEN** the API returns the aggregate rating without any rater identity

#### Scenario: Request an unknown recipe
- **WHEN** a client requests a recipe ID that is not present
- **THEN** the API returns an explicit not-found response
