# recipe-search-and-results Specification

## Purpose

Lets users find and browse recipes based on editable ingredient criteria, with transparent ranking, time limits, and results that can be loaded continuously.

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

### Requirement: Display useful recipe details
The system SHALL show each result's recipe title, cooking time when known, matched and excluded ingredients, and missing ingredients.

#### Scenario: Display a recipe result
- **WHEN** a recipe is shown in search results
- **THEN** its title, available cooking time, matched included ingredients, excluded ingredients it contains, and missing ingredients are visible

### Requirement: Browse results continuously
The user interface SHALL load additional cursor pages as the user reaches the end of the current results and communicate loading, empty, and failure states.

#### Scenario: Reach the end of a result page
- **WHEN** the user scrolls to the end of a page and another cursor is available
- **THEN** the next page is loaded and appended without duplicating existing recipes

#### Scenario: No recipes match the search
- **WHEN** a completed search returns no recipes
- **THEN** the interface communicates that there are no matching recipes

#### Scenario: Search fails
- **WHEN** a recipe search request fails
- **THEN** the interface communicates the failure and provides a way to retry

### Requirement: Credit recipe results without contributor identities
The results interface SHALL retain visible credit to the Food.com recipe dataset and SHALL NOT display contributor identities.

#### Scenario: View recipe results
- **WHEN** recipe results are displayed
- **THEN** the dataset source is credited and no recipe contributor identity is shown
