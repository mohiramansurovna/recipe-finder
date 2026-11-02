# Proposal

## Why

Exact vocabulary matching leaves common synonyms such as “scallion” unrecognized and misses ingredients when users make small spelling errors. R2 improves ingredient discovery while preserving the parser’s transparent, deterministic results and its existing API shape.

## What Changes

- Add curated ingredient aliases, beginning with examples such as scallion → green onion, and resolve them to canonical ingredient names for chips and recipe criteria.
- Extend ingredient parsing to recognize conservative, unambiguous spelling variants; weak or ambiguous matches remain unrecognized.
- Recognize common possession-negation phrasing such as “I don't have butter” and classify the ingredient as excluded.
- Persist alias relationships in the ingredient graph and make alias data available to parsing.
- Add parser, API, and graph-import coverage for canonical aliases, typo matches, natural-language negation, and unrecognized ambiguous or unsupported terms.
- Keep this slice focused on ingredient recognition; do not include staple handling, rarity weighting, or minimum-match ranking changes.

This satisfies the R2 “Better matching” release and PRD FR-1’s requirement to categorize recognized and unrecognized ingredient terms. It also supports the transparent-interpretation goal and the parser’s unit-testability requirement.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ingredient-parsing-and-chips`: recognize curated aliases and conservative, unambiguous typos while returning canonical names in the existing included, excluded, and unrecognized categories.

## Impact

- Modify the existing TypeScript ingredient parser and ingredient repository/API path.
- Add curated alias data and import `ALIAS_OF` relationships into Neo4j, following the relationship already documented in `docs/data-model.md`.
- Keep the parse endpoint’s response shape and editable-chip interactions unchanged; recognized aliases and typos produce canonical ingredient names.
- Extend existing parser and ingredient API tests, and cover alias import/graph resolution.
- No new runtime service or dependency; no changes to recipe ranking, cursor pagination, dataset attribution, or contributor privacy behavior.

The parser, alias mappings, and graph import behavior are created for this feature; existing ingredient parsing and chip behavior are modified.
