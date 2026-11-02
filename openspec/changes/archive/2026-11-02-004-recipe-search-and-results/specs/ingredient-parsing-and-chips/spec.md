# Spec Delta

## MODIFIED Requirements

### Requirement: Present parse results as editable chips
The user interface SHALL display included, excluded, and unrecognized terms as distinct chips and allow users to update ingredient criteria without retyping the original query.

#### Scenario: Remove an interpreted ingredient
- **WHEN** the user removes an included or excluded chip
- **THEN** that term is removed from the current ingredient criteria and is no longer displayed in that category

#### Scenario: Toggle a recognized ingredient
- **WHEN** the user toggles an included or excluded chip
- **THEN** that term moves to the other recognized category

#### Scenario: Add a recognized ingredient
- **WHEN** the user adds an ingredient from the normalized vocabulary
- **THEN** the ingredient appears in the included criteria

#### Scenario: Edit criteria before recipe search exists
- **WHEN** the user adds, removes, or toggles a chip before any recipe results have loaded
- **THEN** the displayed criteria update immediately and the initial recipe results use the updated criteria

#### Scenario: Edit criteria and refresh results
- **WHEN** the user adds, removes, or toggles a chip
- **THEN** the displayed criteria update immediately and the recipe results refresh using the updated criteria
