# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
