# Proposal

## Why

The current search experience works but presents the query, ingredient criteria, filters, and results as a long single-column page that does not match the provided Figma design. This change brings the existing ingredient-first flow into visual and responsive alignment with the desktop and tablet light/dark designs while preserving its search behavior.

## What Changes

- Replace the current page composition and styling with the Figma search-and-results layout: a focused ingredient and filter panel beside a recipe-results area on wider screens.
- Implement the designed light and dark appearances, including a keyboard-accessible theme toggle and coordinated page, panel, card, text, control, and status colors.
- Restyle the ingredient input, editable criteria chips, category and cuisine filters, cooking-time selection, recipe cards, total result count, and loading/empty/error states to fit the design.
- Adapt the layout for narrower viewports without losing access to search criteria, filters, recipe details, or keyboard interactions.
- Preserve existing parsing, filtering, ranking, cursor pagination, source attribution, and contributor-privacy behavior. Extend the recipe-search response with the total number of matches for the submitted criteria so the results header can show an accurate count across cursor pages.

This satisfies the PRD's R2 UI-design roadmap item and supports FR-1 through FR-6 and the accessibility non-functional requirement. The existing React/Vite application and its styles are modified; no new service, data model, or runtime dependency is planned.

**Non-goals:** changing recipe search or ranking semantics, adding new filter types or recipe details, introducing an in-app account or personalization flow, adding external services, and redesigning deployment or data preparation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ingredient-parsing-and-chips`: Add the designed responsive presentation for the ingredient query and editable criteria panel while retaining its current accessible editing behavior.
- `recipe-search-and-results`: Add the designed responsive results presentation and coordinated light/dark appearance while retaining existing filters, result details, and result states.

## Impact

- Web UI: `web/src/app/App.tsx`, `web/src/features/ingredients/`, and `web/src/styles/global.css`.
- API: extend the recipe-search response and its validation to include the total match count.
- Tests: update search API and UI coverage for the count, and extend UI coverage for accessibility, theme appearance, and responsive behavior.
- No graph, data-pipeline, or runtime dependency changes are expected.
