# Proposal

## Why

People need to describe ingredients they have in ordinary text and verify how the app interpreted it before relying on recipe suggestions. This R1 slice establishes transparent, editable ingredient criteria; recipe result search and refresh are deferred to the following `004-recipe-search-and-results` change.

## What Changes

- Create a pure, unit-tested parser that separates recognized included ingredients, explicitly excluded ingredients, and unrecognized terms from free text.
- Create the initial API and web surfaces for submitting text and showing the parser's three result groups as editable, keyboard-accessible chips.
- Let users add, remove, and toggle recognized ingredients between included and excluded without retyping the original text.
- Credit the Food.com dataset in the UI without displaying contributor identities.
- Keep this slice independent of recipe result retrieval: chip edits update the ingredient criteria, while wiring those criteria to refreshed recipe results belongs to change 004.
- Limit matching to the initial normalized ingredient vocabulary. Aliases, typo tolerance, ingredient categories, and broad exclusions such as “no dairy” remain future work.

## Capabilities

### New Capabilities

- `ingredient-parsing-and-chips`: Interpret ingredient text and let users inspect and edit included, excluded, and unrecognized terms.

### Modified Capabilities

- None. The existing specifications cover data preparation/import and the local Compose environment, not user-facing ingredient parsing or chips.

## Impact

- Creates parser/API and React UI functionality; the repository currently has data preparation, Neo4j import, and Compose setup, but no API or web application.
- Uses the normalized ingredient names produced by the existing data-preparation slice as the initial recognized vocabulary.
- Satisfies PRD R1 and FR-1, the ingredient-interpretation and chip-editing portion of FR-2, and FR-6; also addresses parser testability and keyboard accessibility.
- Does not add runtime LLM or external API calls, nor expose recipe contributor information.
- Recipe search, result ranking, pagination, and refresh after chip edits are explicitly out of scope for this change and planned for change 004.
