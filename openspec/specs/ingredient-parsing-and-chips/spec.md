# ingredient-parsing-and-chips Specification

## Purpose

Lets users translate ingredient text into visible, editable ingredient criteria before recipe search is available, including terms the system cannot recognize.

## Requirements

### Requirement: Parse ingredient text into explicit categories
The system SHALL interpret submitted ingredient text against the normalized ingredient vocabulary, resolve curated aliases and conservative unambiguous spelling variants to canonical ingredient names, and return separate included, excluded, category-excluded, and unrecognized terms.

#### Scenario: Parse included and specifically excluded ingredients
- **WHEN** a user submits “chicken, rice, no butter” and all three ingredient names are in the vocabulary
- **THEN** the parser returns chicken and rice as included, butter as excluded, and no unrecognized terms

#### Scenario: Report terms absent from the vocabulary
- **WHEN** a submitted ingredient term has no canonical, alias, or conservative typo match
- **THEN** the parser returns that term as unrecognized rather than silently dropping it

#### Scenario: Interpret a supported category exclusion
- **WHEN** a user submits a supported broad exclusion such as “no dairy”
- **THEN** the parser returns dairy as a category exclusion and does not expand it into individual ingredient exclusions

#### Scenario: Interpret a category exclusion without category support
- **WHEN** a user submits a broad exclusion for a category that is not supported
- **THEN** the parser identifies the category wording as unrecognized and does not infer ingredient exclusions

#### Scenario: Resolve an alias to its canonical ingredient
- **WHEN** a user submits “scallion” and the curated alias maps scallion to green onion
- **THEN** the parser returns green onion in the included terms and does not return scallion as a separate ingredient

#### Scenario: Resolve an alias in an exclusion
- **WHEN** a user submits “no scallion” and the curated alias maps scallion to green onion
- **THEN** the parser returns green onion as excluded

#### Scenario: Understand natural-language possession negation
- **WHEN** a user submits “I don’t have butter,” “I don’t have any butter,” or “I do not have butter”
- **THEN** the parser returns butter as excluded and does not return it as included or unrecognized

#### Scenario: Deduplicate an alias and its canonical name
- **WHEN** a user submits both “scallion” and “green onion”
- **THEN** the parser returns the canonical ingredient green onion only once

#### Scenario: Recognize a conservative single-edit typo
- **WHEN** a submitted ingredient token of at least four characters differs from one vocabulary candidate by one insertion, deletion, substitution, or adjacent transposition, and the candidate is uniquely closest
- **THEN** the parser returns that candidate's canonical ingredient name in the appropriate included or excluded terms

#### Scenario: Leave an ambiguous or weak typo unrecognized
- **WHEN** a submitted token has multiple equally close vocabulary candidates or no candidate within the conservative matching threshold
- **THEN** the parser returns the submitted term as unrecognized instead of selecting an arbitrary ingredient

### Requirement: Parse ingredient text deterministically without runtime services
The parser SHALL be a pure operation whose output depends only on the submitted text and supplied ingredient vocabulary, without runtime LLM or external API calls.

#### Scenario: Repeat an identical parse
- **WHEN** the parser receives the same text and vocabulary more than once
- **THEN** it returns the same categorized terms each time without accessing an external service

### Requirement: Present parse results as editable chips
The user interface SHALL display included, excluded, category-excluded, and unrecognized criteria as distinct chips and allow users to update criteria without retyping the original query.

#### Scenario: Remove an interpreted ingredient
- **WHEN** the user removes an included or excluded chip
- **THEN** that term is removed from the current ingredient criteria and is no longer displayed in that category

#### Scenario: Toggle a recognized ingredient
- **WHEN** the user toggles an included or excluded chip
- **THEN** that term moves to the other recognized category

#### Scenario: Add a recognized ingredient
- **WHEN** the user adds an ingredient from the normalized vocabulary
- **THEN** the ingredient appears in the included criteria

#### Scenario: Edit criteria before recipe results have loaded
- **WHEN** the user adds, removes, or toggles a chip before any recipe results have loaded
- **THEN** the displayed criteria update immediately and the initial recipe results use the updated criteria

#### Scenario: Edit criteria and refresh results
- **WHEN** the user adds, removes, or toggles a chip
- **THEN** the displayed criteria update immediately and the recipe results refresh using the updated criteria

#### Scenario: Display a canonical name for an alias or typo match
- **WHEN** submitted text is recognized through a curated alias or conservative typo match
- **THEN** the resulting chip displays the canonical ingredient name and recipe search uses that canonical ingredient criterion

#### Scenario: Remove a category exclusion
- **WHEN** the user removes a category-exclusion chip
- **THEN** the category is removed from the current search criteria and the recipe results refresh

### Requirement: Make ingredient chips keyboard accessible
The user interface SHALL support adding, removing, and toggling ingredient chips and removing category-exclusion chips using keyboard interaction, and expose each chip's category and available actions to assistive technology.

#### Scenario: Operate a chip without a pointer
- **WHEN** a keyboard user focuses an ingredient or category-exclusion chip and invokes its available action
- **THEN** the action completes and the resulting category or removal is communicated accessibly

### Requirement: Credit the recipe dataset without exposing contributor identities
The user interface SHALL visibly credit the Food.com recipe dataset and SHALL NOT display contributor identities.

#### Scenario: Display source attribution with ingredient criteria
- **WHEN** the ingredient parsing interface is displayed
- **THEN** it credits the Food.com recipe dataset and does not show recipe contributor identities

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
