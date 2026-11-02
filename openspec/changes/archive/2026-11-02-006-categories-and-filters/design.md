# Design

## Context

See proposal.md for motivation and scope. The preparation pipeline currently reads the source `tags` field but does not emit cuisine data; graph import creates Recipe and Ingredient nodes and their relationships. Search validates ingredient lists and a maximum time, filters and fingerprints those criteria for cursor pagination, and the React app restarts searches when ingredient criteria or time changes. The graph model documentation already describes Cuisine and `IN_CUISINE`, but the runtime pipeline does not yet create them.

## Goals / Non-Goals

**Goals:**
- Keep category and cuisine classification deterministic, locally reviewable, and reproducible from the prepared dataset.
- Apply filters in graph search while preserving the existing ranking order and cursor pagination behavior.
- Keep category exclusions separate from exact-ingredient exclusions and preserve the current semantics of exact exclusions.

**Non-Goals:**
- Automatically infer classifications from recipe names, arbitrary tags, or runtime services.
- Provide completeness guarantees for dietary or allergen safety, or make nutrition and health claims.
- Change recipe ranking, cursor pagination strategy, or the existing dataset privacy boundary.

## Decisions

1. **Use curated classification inputs and graph relationships.** Maintain a normalized ingredient-to-category mapping for dairy, nuts, meat, and fish/seafood, and a source-tag-to-canonical-cuisine mapping. Preparation validates mapping references after ingredient aliases are canonicalized, emits graph-ready classification rows, and does not infer a classification when there is no mapping. Import creates `IngredientCategory` nodes connected with `IN_CATEGORY` and `Cuisine` nodes connected to recipes with `IN_CUISINE`. This keeps multi-category ingredients and multi-cuisine recipes representable without embedding filter logic in names or arbitrary tag strings. A property-only category list and treating every source tag as a cuisine were considered; the graph relationships and allowlisted tag mapping make membership explicit and avoid false cuisine matches.

2. **Use one category-exclusion contract for category chips and the Vegetarian preset.** The parser returns supported broad category exclusions separately from ingredient exclusions. The preset selects both meat and fish/seafood categories, so the search API and graph query need no special vegetarian code path. Unsupported broad categories remain unrecognized. Category mappings are curated data, not a claim that unclassified ingredients are safe.

3. **Apply category and cuisine restrictions before paging, without changing ranking.** Search excludes recipes connected through `USES` and `IN_CATEGORY` to a selected category. Multiple selected cuisines use OR semantics: a recipe qualifies if it has at least one selected `IN_CUISINE` relationship. The existing time and exact-ingredient criteria retain their current behavior. Canonically sorted category and cuisine values join the existing criteria in the cursor fingerprint; the UI's search key includes them as well, so filter edits cannot reuse a cursor from earlier criteria.

4. **Expose supported options from the imported graph.** The API provides the category and cuisine options available in the current dataset for the UI, rather than maintaining a second hard-coded list. Parse requests use the category vocabulary alongside the ingredient vocabulary. Existing request validation remains strict, with bounded, unique filter values, and no new external service or package is required.

5. **Keep the data lifecycle aligned with the fresh-graph importer.** Extend prepared-data validation and import to include classifications and references. The importer already requires an empty graph, so no in-place migration is introduced; a graph must be rebuilt from prepared data to adopt or roll back the added relationships.

## Risks / Trade-offs

- [Curated category coverage can be incomplete] → Keep mappings explicit, test representative ingredients, and avoid presenting the filters as health or allergen guarantees.
- [Source tags can be noisy or omit cuisine] → Map only reviewed source tags to canonical cuisines; recipes without a mapped cuisine remain available when no cuisine filter is selected.
- [Additional relationship checks can affect search latency] → Apply filters in the database query, retain existing indexes and page limits, and cover the query against the Neo4j integration fixture.
- [Prepared data and graph shape change together] → Validate every mapping before loading and document that adoption or rollback uses a fresh graph import.

## Migration Plan

Update preparation and import together, then rebuild the local or demo graph from the new prepared outputs. The importer must continue to reject non-empty graphs. To roll back, restore the previous application and preparation version and recreate the graph from its matching prepared-data outputs; do not attempt an in-place graph migration.
