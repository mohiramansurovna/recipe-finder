# Proposal

## Why

The app currently interprets and lets users edit ingredient criteria, but it does not retrieve recipes. This R1 slice completes the core discovery journey by showing recipes ranked against those criteria, with useful recipe details, time filtering, and scrolling results.

## What Changes

- Add recipe search over the existing Neo4j `Recipe` and `Ingredient` graph, including matching and missing ingredient details.
- Rank results by fewest missing included ingredients, then most matched included ingredients, then a stable recipe identifier.
- Return cursor-paginated results and load additional pages as the user scrolls.
- Show recipe title, cooking time, matched ingredients, and missing ingredients; provide time limits of 15, 30, and 60 minutes plus Any time.
- Apply searches when users submit ingredient text or add, remove, or toggle recognized ingredient chips.
- Treat specifically excluded ingredients as a ranking penalty rather than an exclusion; when no included ingredients are selected, browse all recipes, applying exclusions and the time limit.
- Preserve visible Food.com source attribution and do not display contributor identities.

## Capabilities

### New Capabilities
- `recipe-search-and-results`: Search, rank, paginate, filter, and display recipes using the user's editable ingredient criteria.

### Modified Capabilities
- `ingredient-parsing-and-chips`: Replace the pre-search behavior where chip edits did not refresh results with behavior that searches using the updated criteria.

## Impact

- Extend the existing Express API and Neo4j repository for recipe queries and cursor-based pagination.
- Extend the existing React ingredient search experience with recipe cards, time filtering, result loading, and empty/loading/error states.
- Add unit and integration coverage for ranking, exclusions, pagination, time limits, and UI refresh behavior.
- No graph schema migration or new runtime service is expected; use the existing Neo4j data, driver, rate limiting, and app stack.

This change satisfies R1 and PRD FR-2 through FR-6, plus the search testability and first-page performance goals in the NFRs. It builds on the existing API, web UI, ingredient criteria, and imported graph rather than scaffolding a new application.

Explicit non-goals: aliases, typo tolerance, staples-aware ranking, minimum-match thresholds, ingredient categories, cuisine filters, substitutions, personalization, user accounts, contributor information, external APIs, and deployment infrastructure.
