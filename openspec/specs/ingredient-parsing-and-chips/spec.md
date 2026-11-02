# ingredient-parsing-and-chips Specification

## Purpose

Lets users translate ingredient text into visible, editable ingredient criteria before recipe search is available, including terms the system cannot recognize.

## Requirements

### Requirement: Parse ingredient text into explicit categories
The system SHALL interpret submitted ingredient text against the normalized ingredient vocabulary and return separate included, excluded, and unrecognized terms.

#### Scenario: Parse included and specifically excluded ingredients
- **WHEN** a user submits “chicken, rice, no butter” and all three ingredient names are in the vocabulary
- **THEN** the parser returns chicken and rice as included, butter as excluded, and no unrecognized terms

#### Scenario: Report terms absent from the vocabulary
- **WHEN** a submitted ingredient term has no match in the normalized vocabulary
- **THEN** the parser returns that term as unrecognized rather than silently dropping it

#### Scenario: Interpret a category exclusion without category support
- **WHEN** a user submits a broad exclusion such as “no dairy”
- **THEN** the parser does not infer exclusions for individual dairy ingredients and identifies the unsupported category wording as unrecognized

### Requirement: Parse ingredient text deterministically without runtime services
The parser SHALL be a pure operation whose output depends only on the submitted text and supplied ingredient vocabulary, without runtime LLM or external API calls.

#### Scenario: Repeat an identical parse
- **WHEN** the parser receives the same text and vocabulary more than once
- **THEN** it returns the same categorized terms each time without accessing an external service

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
- **WHEN** the user adds, removes, or toggles a chip in this release slice
- **THEN** the displayed ingredient criteria update immediately, without claiming that recipe results were refreshed

### Requirement: Make ingredient chips keyboard accessible
The user interface SHALL support adding, removing, and toggling ingredient chips using keyboard interaction and expose each chip's category and available actions to assistive technology.

#### Scenario: Operate a chip without a pointer
- **WHEN** a keyboard user focuses an ingredient chip and invokes its available action
- **THEN** the action completes and the resulting category or removal is communicated accessibly

### Requirement: Credit the recipe dataset without exposing contributor identities
The user interface SHALL visibly credit the Food.com recipe dataset and SHALL NOT display contributor identities.

#### Scenario: Display source attribution with ingredient criteria
- **WHEN** the ingredient parsing interface is displayed
- **THEN** it credits the Food.com recipe dataset and does not show recipe contributor identities
