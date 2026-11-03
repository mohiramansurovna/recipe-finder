# Design

## Context

See proposal.md for motivation and specs for observable requirements. The current React page renders the query, ingredient criteria, cuisine/category filters, cooking-time selection, and recipe results in one vertical flow. Styling is split between global and ingredient CSS. The recipe-search API and client response schema currently contain only a recipe page and `nextCursor`; the Neo4j repository fetches one extra row to determine whether another cursor page exists.

The provided Figma board has desktop and tablet result screens in light and dark appearances. The implementation uses the existing React/Vite, TypeScript, CSS, Express, and Neo4j stack; no new runtime dependency is needed.

## Goals / Non-Goals

**Goals:**
- Keep the search criteria and results hierarchy clear at wide and narrow viewport widths.
- Make the light/dark palettes consistent across the full interface and its interactive states.
- Show an accurate total for the eligible result set without changing its ranking or cursor order.
- Preserve semantic controls, keyboard access, and existing search/filter behavior.

**Non-Goals:**
- Add recipe photography or data not supplied by the existing API.
- Persist theme preference across browser sessions.
- Change ranking, filter semantics, or the cursor format.

## Decisions

1. **Compose the page as a search panel and results area.** Keep the query, categorized ingredient criteria, autocomplete, and existing filters together in the panel. Place the result count and cards in the adjacent area at wide sizes; use a single-column flow with the panel first when the available width cannot support both. CSS grid/flex and the existing CSS files are sufficient; a new layout or component library is not justified for this scope.

2. **Use design tokens for both color schemes and a local theme control.** Define shared CSS custom properties for surfaces, text, borders, accents, and statuses, then apply the selected palette to the page and controls. Keep the explicit light/dark choice in React state for the current page view, defaulting to light; expose a real button with an accessible name that reflects the action. This follows the two Figma variants without introducing storage, preference synchronization, or a theme dependency.

3. **Add a total count before cursor slicing.** Add a numeric `totalCount` to the recipe-search page type and response schema. In the Neo4j repository, count the eligible recipes using the same time, category, and cuisine eligibility predicates as the page query, but without the cursor predicate or page limit; return that count with every page. Exact included/excluded ingredients continue to rank results rather than remove them, and category/cuisine/time filters keep their current exclusion semantics. A dedicated aggregate count is preferred to inferring a total from page size or the presence of a next cursor, neither of which can produce the Figma's accurate total. The count is computed for each request so it cannot become stale through application-side caching.

4. **Keep the API addition backward-compatible for existing clients.** The count is an additive response field; update the API repository/page type, route tests, and web response validation together. The current web client requires the field and renders it above the results; no endpoint or request payload changes are needed.

5. **Use existing semantic controls and preserve recipe details.** Keep the form, fieldsets, labeled filters, chip actions, result articles, and status/error announcements. Restyle their hierarchy and states rather than replacing them with non-semantic click targets. Render ingredient details from the existing result data; do not imply that excluded ingredients or missing ingredients have different search semantics.

## Risks / Trade-offs

- [The additional aggregate adds database work to each page request] → Use a bounded aggregate over the same graph filters, keep it in the current request path, and verify response shape and query behavior with the repository/API tests.
- [A separately computed count could diverge from the page under concurrent graph mutation] → The application has no runtime recipe mutation flow; use identical eligibility predicates for the count and page queries and test time/category/cuisine filters together.
- [Theme styling may miss nested controls or status states] → Centralize palette values and exercise both themes in UI tests, including focus and error states.
- [A two-column design can become cramped at intermediate widths] → Use a responsive breakpoint that stacks the content before either panel becomes unusably narrow; verify at desktop, tablet, and narrow widths.

## Migration Plan

Deploy the additive search-response field and web client together through the existing application stack. Update all API test doubles and fixtures to include the total count. If rolling back the UI/API change, deploy the prior matching client and API versions together; no database migration or graph rebuild is required.

## Open Questions

None.
