# ingredient-parsing-and-chips Specification

## Purpose

Provides deterministic API parsing of ingredient text into explicit search criteria, including terms the system cannot recognize.

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

### Requirement: Expose ingredient vocabulary and filter metadata
The API SHALL provide normalized ingredient names and supported ingredient categories for first-party clients without exposing contributor identities.

#### Scenario: Retrieve ingredient vocabulary
- **WHEN** a client requests the ingredient vocabulary
- **THEN** the API returns canonical ingredient names in deterministic order

#### Scenario: Retrieve supported categories
- **WHEN** a client requests filter metadata
- **THEN** the API returns the supported categories and cuisines in deterministic order
