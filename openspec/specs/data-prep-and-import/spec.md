# data-prep-and-import Specification

## Purpose

Provides a reproducible path to prepare Food.com recipe data and load the first Recipe Graph dataset into Neo4j without retaining contributor identities.

## Requirements

### Requirement: Optional dataset acquisition
The workflow SHALL provide an optional way to obtain dataset version 2 of `shuyangli94/food-com-recipes-and-user-interactions` into the local raw-data directory, without requiring network access during preparation or application runtime.

#### Scenario: Acquire the pinned source files
- **WHEN** the user runs the acquisition workflow with authorized Kaggle access
- **THEN** the source files are downloaded into the local raw-data directory

#### Scenario: Kaggle access is unavailable
- **WHEN** the user runs the acquisition workflow without working Kaggle authentication
- **THEN** the workflow exits with an actionable error and does not expose or store credentials

#### Scenario: Pinned archive lacks required raw recipe fields
- **WHEN** the downloaded archive does not contain a source file with the raw recipe fields required by preparation
- **THEN** the workflow reports the incompatibility and stops before producing graph-ready data

### Requirement: Prepare the initial graph dataset
The preparation workflow SHALL produce graph-ready recipe, ingredient, and recipe-ingredient relationship data from compatible source files, with normalized ingredient names and explicit staple flags.

#### Scenario: Prepare valid source data
- **WHEN** the user runs preparation with valid local source files
- **THEN** the workflow produces data representing Recipe IDs, names, cooking times, Ingredient names, staple flags, and USES relationships

#### Scenario: A recipe is missing its required name
- **WHEN** a source recipe has an ID but no usable name
- **THEN** the recipe is excluded from graph-ready data and reported with its ID and reason

#### Scenario: Normalize ingredient names
- **WHEN** source ingredient names differ only by case, surrounding whitespace, or punctuation
- **THEN** preparation normalizes those mechanical differences without merging semantic variants

#### Scenario: Mark staple ingredients
- **WHEN** a prepared ingredient matches the explicit staple list
- **THEN** its output is marked as a staple and other ingredients are not

### Requirement: Preserve and report cooking-time outliers
The preparation workflow SHALL preserve valid source cooking-time values and report suspected outliers identified by a documented, deterministic rule rather than silently discarding or rewriting them.

#### Scenario: A valid suspected outlier is encountered
- **WHEN** a source recipe has a valid cooking-time value identified as a suspected outlier
- **THEN** the value is preserved in the prepared recipe data and the outlier is included in the preparation report

#### Scenario: A cooking-time value is invalid
- **WHEN** a source recipe has a missing or invalid cooking-time value
- **THEN** the recipe remains in prepared data with a null cooking-time value and the affected record is reported

### Requirement: Exclude contributor identities
The preparation and import workflows SHALL NOT store or expose personal data or contributor identity fields from source data.

#### Scenario: Import source records with contributor fields
- **WHEN** source files contain contributor identity fields
- **THEN** those fields are excluded from prepared output and the graph

### Requirement: Import into a fresh graph
The importer SHALL load the prepared initial graph data only into an empty Neo4j database and SHALL fail clearly when the target already contains graph data.

#### Scenario: Import into an empty database
- **WHEN** the importer is run against an empty Neo4j database with valid prepared data
- **THEN** it creates unique Recipe and Ingredient nodes and their USES relationships

#### Scenario: Import into a non-empty database
- **WHEN** the importer is run against a database that already contains graph data
- **THEN** it fails before loading additional data and reports that a fresh database is required

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
