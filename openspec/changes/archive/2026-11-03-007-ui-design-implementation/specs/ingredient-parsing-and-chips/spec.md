# Spec Delta

## ADDED Requirements

### Requirement: Present ingredient search and criteria in a responsive panel
The interface SHALL group the ingredient query, editable ingredient criteria, and add-ingredient control in a visually distinct search panel that adapts to the available viewport width.

#### Scenario: View the search panel on a wide screen
- **WHEN** a user opens the recipe search on a wide screen
- **THEN** the ingredient query, submit action, categorized criteria chips, and add-ingredient control appear together in the search panel beside the recipe results

#### Scenario: View the search panel on a narrow screen
- **WHEN** the available viewport is too narrow for a side-by-side search panel and results
- **THEN** the search panel reflows without horizontal page overflow and all query, criteria, and add-ingredient controls remain available

#### Scenario: Edit criteria in the designed panel
- **WHEN** a user adds, removes, or toggles an ingredient criterion in the search panel
- **THEN** the existing accessible chip action and search-refresh behavior are preserved
