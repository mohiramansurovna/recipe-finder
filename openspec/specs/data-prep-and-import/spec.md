# data-prep-and-import Specification

## Purpose

Provides a reproducible path to prepare the pinned Food.com dataset and load graph-ready recipe data into Neo4j without retaining contributor identities.

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

### Requirement: Prepare graph data
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
The importer SHALL load prepared graph data only into an empty Neo4j database and SHALL fail clearly when the target already contains graph data.

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

### Requirement: Prepare curated ingredient aliases
The preparation workflow SHALL resolve curated aliases to canonical ingredients and emit deterministic alias mappings for import.

#### Scenario: Prepare a valid alias
- **WHEN** a curated alias maps to an ingredient in the normalized vocabulary
- **THEN** preparation emits the alias and canonical name without rewriting or duplicating recipe ingredient relationships

#### Scenario: Reject invalid alias mappings
- **WHEN** a curated alias is a self-mapping, conflicts with another mapping, forms a chain, or targets an unknown ingredient
- **THEN** preparation fails with an actionable error before publishing prepared data

### Requirement: Prepare recipe details and anonymous source ratings
The preparation workflow SHALL preserve available instructions and source rating values without including identities or review text.

#### Scenario: Prepare available recipe details
- **WHEN** a source recipe contains instructions or an aggregate rating
- **THEN** the prepared recipe data includes valid available values and leaves missing or invalid optional values unavailable

#### Scenario: Prepare anonymous interaction ratings
- **WHEN** source interactions contain valid nonzero ratings for prepared recipes
- **THEN** prepared rating data contains only the recipe ID and numeric rating

#### Scenario: Exclude invalid or unrelated interaction records
- **WHEN** an interaction rating is invalid, zero, or references a recipe excluded from prepared data
- **THEN** it is not emitted as a rating record

### Requirement: Follow the version-2 input and prepared CSV contracts
Preparation SHALL accept the pinned version-2 source and curated mapping fields, and emit the documented graph CSV and diagnostic fields. Empty optional values SHALL be represented as empty CSV fields; absent classifications SHALL have no rows.

#### Scenario: Prepare from the pinned source and mappings
- **WHEN** preparation reads `RAW_recipes.csv` with required columns `id`, `name`, `minutes`, `tags`, and `ingredients`, optional `steps`/`instructions` and `aggregate_rating`/`average_rating`/`rating`, and optional `RAW_interactions.csv` with `recipe_id` and `rating`
- **THEN** graph outputs have these headers: `recipes.csv` (`id,name,minutes,instructions,aggregateRating`); `ratings.csv` (`recipeId,rating`); `ingredients.csv` (`name,isStaple`); `recipe_ingredients.csv` (`recipeId,ingredientName`); `ingredient_aliases.csv` (`alias,canonicalName`); `ingredient_categories.csv` (`ingredientName,category`); and `recipe_cuisines.csv` (`recipeId,cuisineName`)

#### Scenario: Read curated classification mappings and diagnostic outputs
- **WHEN** preparation reads `data/ingredient-aliases.csv` (`alias,canonicalName`), `data/ingredient-categories.csv` (`ingredientName,category`), and `data/cuisine-tags.csv` (`sourceTag,cuisineName`)
- **THEN** reports use `cooking_time_issues.csv` (`recipeId,sourceValue,reason`), `cooking_time_outliers.csv` (`recipeId,minutes`), and `invalid_recipes.csv` (`recipeId,sourceRecord,reason`), with aggregate preparation counts and threshold in `summary.json`

#### Scenario: Represent unavailable optional values
- **WHEN** a recipe has unavailable cooking time, instructions, or aggregate rating, or has no mapped cuisine or category
- **THEN** unavailable recipe values are empty fields, while missing category/cuisine classifications produce no rows rather than fabricated values

### Requirement: Preserve the imported graph schema and uniqueness constraints
The importer SHALL map prepared data to the existing Recipe Graph nodes, properties, relationships, and uniqueness constraints without creating identity data.

#### Scenario: Import prepared graph records
- **WHEN** valid prepared CSVs are imported into a fresh graph
- **THEN** the graph contains `Recipe` (`id`, `name`, optional `minutes`, `instructions`, `aggregateRating`), `Ingredient` (`name`, `isStaple`), `IngredientCategory` (`name`), `Cuisine` (`name`), and anonymous `Rating` (`value`) nodes; `USES`, `ALIAS_OF`, `IN_CATEGORY`, `IN_CUISINE`, and `HAS_RATING` relationships; and uniqueness constraints on `Recipe.id`, `Ingredient.name`, `IngredientCategory.name`, and `Cuisine.name`

#### Scenario: Keep missing properties and identities out of the graph
- **WHEN** optional recipe values are empty or source rows contain contributor or rater identities
- **THEN** unavailable properties remain unset and identity fields are not imported

### Requirement: Report version-2 cooking-time outliers without changing values
For pinned dataset version 2, preparation SHALL use nearest-rank quartiles Q1=20 and Q3=65 minutes, with a Tukey upper fence of 132.5 minutes, and report integer cooking times greater than the fence without changing them.

#### Scenario: Preserve and report an outlier
- **WHEN** a prepared recipe has an integer cooking time of at least 133 minutes
- **THEN** its original value remains in `recipes.csv` and its recipe ID and minutes appear in `cooking_time_outliers.csv`

#### Scenario: Do not report the boundary or non-integer values
- **WHEN** a cooking time is 132 minutes, null, invalid, or non-integer
- **THEN** it is not classified as a cooking-time outlier

### Requirement: Restrict imported individual ratings to valid anonymous values
The preparation workflow SHALL emit only anonymous individual ratings from 1 through 5; zero ratings SHALL be omitted and malformed or out-of-range ratings SHALL not be published.

#### Scenario: Emit a valid source rating
- **WHEN** an interaction for a prepared recipe contains an integer rating from 1 through 5
- **THEN** `ratings.csv` contains only its recipe ID and numeric rating

#### Scenario: Exclude zero and invalid source ratings
- **WHEN** an interaction has rating zero
- **THEN** no row for that rating is emitted

#### Scenario: Reject malformed or out-of-range source ratings
- **WHEN** an interaction rating is nonnumeric, non-integer, or outside 0 through 5
- **THEN** preparation fails before publishing prepared data and no invalid rating enters the graph
