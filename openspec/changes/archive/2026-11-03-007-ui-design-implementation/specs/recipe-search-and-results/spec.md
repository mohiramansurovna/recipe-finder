# Spec Delta

## ADDED Requirements

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

### Requirement: Present recipe results in a responsive results area
The results interface SHALL present the matching-recipe count and recipe cards in a visually distinct area that adapts to the available viewport width.

#### Scenario: View results on a wide screen
- **WHEN** a user views recipe results on a wide screen
- **THEN** the result count and recipe cards appear beside the ingredient search and filter panel

#### Scenario: View results on a narrow screen
- **WHEN** the available viewport is too narrow for side-by-side search and results
- **THEN** the results area reflows without horizontal page overflow and remains usable after the search and filter panel

#### Scenario: Show recipe details in a result card
- **WHEN** a recipe appears in the results area
- **THEN** its name, available cooking time, matched ingredients, missing ingredients, and any excluded ingredients it contains remain visible in the designed card

### Requirement: Provide light and dark recipe-search themes
The recipe-search interface SHALL provide coordinated light and dark themes and a keyboard-operable control that lets the user switch between them.

#### Scenario: Switch between themes
- **WHEN** a user activates the theme control
- **THEN** the page, search panel, results, cards, text, controls, and status messages use the selected light or dark theme

#### Scenario: Operate the theme control with a keyboard
- **WHEN** a keyboard user focuses and activates the theme control
- **THEN** the selected theme changes and the control communicates its accessible name and current action
