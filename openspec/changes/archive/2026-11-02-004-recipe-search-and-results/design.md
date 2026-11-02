# Design

## Context

See `proposal.md` for motivation and `specs/recipe-search-and-results/spec.md` for the behavior contract. The existing app already parses ingredient text against Neo4j vocabulary, edits included/excluded criteria in React, and imports `Recipe`, `Ingredient`, and `USES` relationships. Recipe retrieval and result refresh are not implemented. Recipe IDs are stable source IDs; recipe time may be absent.

## Goals / Non-Goals

**Goals:**
- Keep search data access behind an injectable repository and reuse the existing Neo4j driver.
- Keep ranking and pagination deterministic across requests.
- Make stale or failed searches visible rather than replacing current results with misleading empty data.
- Preserve the existing rate limit, proxy path, dataset credit, and contributor privacy.

**Non-Goals:**
- Add graph nodes, relationships, indexes, or a migration.
- Match aliases, fuzzy terms, ingredient categories, or substitutions.
- Introduce client state persistence, accounts, or a new search service.

## Decisions

### Add a recipe repository and a validated search endpoint

Define a recipe-search input and result contract at the API boundary, validate it with the existing Zod dependency, and pass valid requests to an injected recipe repository. The request includes included and excluded ingredient names, an optional maximum cooking time, and an optional cursor. Return recipe IDs, titles, cooking times, matched ingredients, missing ingredients, excluded matches, and the next cursor. Keep graph failures on the existing explicit service-error path; invalid criteria or cursors return a client error.

Use the existing API rate limiter and `/api` route rather than exposing Neo4j or adding a new service. Keep the existing ingredient repository focused on vocabulary access instead of coupling recipe search to it.

**Alternative considered:** Put Cypher in the route handler. That would make query behavior harder to test independently and mix HTTP validation with graph access.

### Compute rank components from the imported graph

For each candidate recipe, compare its `USES` ingredient names with the included and excluded criteria. Missing ingredients are recipe ingredients absent from the included list; matched ingredients are the intersection with included criteria; excluded matches are the intersection with excluded criteria. Do not remove recipes containing exclusions: use the count of excluded matches as a ranking penalty after missing and matched counts. With an empty included list, browse all recipes and apply the same ranking and any time limit.

Order by ascending missing count, descending included-match count, ascending excluded-match count, then stable recipe ID. Return ingredient details needed by the result cards from the same search query so the UI does not issue one request per recipe. Apply a selected maximum only to recipes with a known time at or below that maximum; Any time includes unknown cooking times.

**Alternative considered:** Filter out every recipe with an excluded match. The requested behavior is to keep those results but rank them lower, so hard exclusion would discard potentially useful options.

### Use keyset pagination bound to search criteria

Use a fixed server-side page size and a keyset cursor containing the last result's rank values and recipe ID. Encode it as an opaque token and bind it to a canonical fingerprint of the included criteria, excluded criteria, and time limit. Reject malformed or mismatched cursors rather than silently restarting. The final recipe-ID tie-breaker ensures every page boundary is deterministic.

**Alternative considered:** Offset pagination can shift or repeat items when earlier-ranked data changes and is explicitly disallowed by the project constraints. A cursor that contains only the recipe ID is insufficient because search order is based on computed rank values.

### Drive result refresh from the existing ingredient criteria UI

When text is submitted, parse it as today and search using the resulting recognized criteria. Adding, removing, or toggling a chip and changing the time limit starts a new first-page request. Clear the old cursor and results for a new search; append later pages only to the same search. Use request cancellation or an equivalent request-generation guard so a slower, older response cannot overwrite newer criteria. Keep initial loading, next-page loading, empty, and retryable error states distinct.

Use an `IntersectionObserver` sentinel for continuous loading and retain a keyboard-operable “Load more” control as a fallback and explicit accessible action. Render title, known cooking time, matched included ingredients, missing ingredients, and excluded matches; keep the existing Food.com attribution and avoid contributor fields.

**Alternative considered:** Fetch results separately for every displayed recipe or use client-side sorting. Per-recipe calls multiply latency, while client-side sorting requires loading the full dataset and would undermine cursor pagination.

### Test at repository, API, and UI boundaries

Use repository unit tests with deterministic fixtures for rank order, exclusions, missing times, and page boundaries. Use API integration tests with an injected fake repository to validate request handling, cursor errors, and explicit graph failures. Extend the existing React Testing Library coverage to verify search submission, edits and time changes restarting results, appended pages, visible result details, retry, and accessible loading behavior. Keep the existing parser unit tests passing.

No new dependency is required: the project already uses Neo4j, Zod, Vitest, Supertest, React Testing Library, and the browser's `IntersectionObserver`.

## Risks / Trade-offs

- [Ranking all recipes requires computing ingredient-fit counts and may exceed the roughly one-second first-page goal on demo hardware] → Use a bounded keyset page, inspect Neo4j query plans against representative imported data, and optimize the query without changing the rank contract if measurements miss the target.
- [A cursor cannot guarantee a snapshot if graph data changes between pages] → The local imported graph is treated as stable during a search; bind the cursor to criteria and maintain deterministic ordering.
- [Results may contain recipes with excluded ingredients because exclusions are a penalty, not a filter] → Show excluded matches on each affected result so users can make an informed choice.
- [Automatic searches after quick successive edits may overlap] → Cancel stale requests or ignore responses from an older search generation.
- [An empty included list can browse the entire dataset] → Return only the first bounded page and continue through the same cursor flow.

## Migration Plan

No data migration is needed. Add the recipe-search API and repository, then connect the existing UI to it. Validate against an isolated test graph and the current Compose stack without clearing or replacing the imported Neo4j data. Rollback by reverting the API, repository, and UI additions; the graph remains unchanged.
