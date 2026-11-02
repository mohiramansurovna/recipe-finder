# Spec Delta

## ADDED Requirements

### Requirement: Prepare deterministic ingredient-category classifications
The preparation workflow SHALL associate ingredients with supported dietary categories using explicit, reproducible classification data.

#### Scenario: Prepare a classified ingredient
- **WHEN** an ingredient has one or more valid category mappings
- **THEN** the prepared graph data represents each mapped category for that ingredient

#### Scenario: Prepare an unclassified ingredient
- **WHEN** an ingredient has no category mapping
- **THEN** the workflow leaves it unclassified rather than inferring a category

#### Scenario: Reject an invalid category mapping
- **WHEN** a category mapping references an ingredient absent from the prepared vocabulary or uses an unsupported category
- **THEN** preparation fails with an actionable error before publishing prepared data

### Requirement: Prepare recipe cuisine classifications
The preparation workflow SHALL produce deterministic cuisine classifications from supported cuisine tags in the source recipe data.

#### Scenario: Prepare a recipe with a supported cuisine tag
- **WHEN** a recipe has one or more tags matching supported cuisines
- **THEN** the prepared data associates the recipe with each matching cuisine

#### Scenario: Prepare a recipe without a supported cuisine tag
- **WHEN** a recipe has no tag matching a supported cuisine
- **THEN** the recipe remains eligible for searches without a cuisine filter and has no cuisine classification

### Requirement: Import category and cuisine classifications
The importer SHALL validate and load prepared ingredient-category and recipe-cuisine classifications into the graph without importing contributor identities.

#### Scenario: Import valid filter metadata
- **WHEN** valid prepared classification data is imported into a fresh graph
- **THEN** ingredient categories and recipe cuisines are available to recipe search

#### Scenario: Reject invalid filter metadata
- **WHEN** prepared classification data references an unknown ingredient or recipe, or contains an unsupported classification
- **THEN** validation fails clearly before graph data is loaded
