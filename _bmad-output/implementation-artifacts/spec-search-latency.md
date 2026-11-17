---
title: 'Faster Recipe Search'
type: 'performance'
created: '2026-11-17'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'cb373c7a2b11a1c68515e4ce3ca57eca6b9f4607'
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/docs/prd.md'
  - '{project-root}/README.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `POST /api/recipes/search` takes several seconds per page on the full dataset (231,636 recipes, 2.1M `USES` edges). The Android client now pages automatically as the user scrolls, so every page pays the full cost again. The PRD target is about one second for a typical first page, and it is not met.

**Approach:** Stop scoring every recipe on every request. Score only recipes that touch the request's included or excluded ingredients, take the remaining "no overlap" recipes from an ordered index, and merge the two. Add a short-lived in-process cache so later pages and repeated counts are cheap. Ranking, cursor semantics, filters, response shape and errors do not change.

## Boundaries & Constraints

**Always:** Keep the API contract, validation and error behavior, ranking order (fewest missing, most matched, fewest excluded matches, then recipe ID), criteria-bound cursor semantics, `totalCount`, filter semantics, rate limits and database privacy. Keep feature logic in application services behind core contracts; routes do not query Neo4j and adapters implement ports wired at the composition root. Any graph change must be applied by the import and by a migration for existing graphs, and must be recorded so an older graph is detected rather than silently slow or wrong. Keep datasets, secrets and deployment state out of Git.

**Never:** Change what a given request returns, add a breaking API change, expose the database, cache anything per account, or cache across a graph re-import. Do not provision AWS resources as part of this work.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First page | Included ingredients, no cursor, cold cache | Same page and `totalCount` as today, measurably faster | Unavailable graph still reports an error, never an empty success |
| Later page | Cursor from a previous page, same criteria | Same next page as today; served from cache when warm, correct when cold | Cursor with different criteria still returns the existing client error |
| No overlap recipes | Recipe sharing no included or excluded ingredient | Still ranked by its total ingredient count, so it can appear before larger partial matches exactly as today | Not dropped |
| Only excluded or filter terms | No included ingredients | Same ranking as today (all recipes unmatched) | Same as today |
| Cache expiry or restart | No request for the entry within 1 minute, evicted, or process restarted | Recomputed with identical results | Cache failure falls back to the uncached query |
| Older graph | Graph lacks the new property or index | API starts and still answers correctly via the existing query path | Readiness/log reports the graph needs migration |

</frozen-after-approval>

## Evidence (measured 2026-11-17, local Neo4j, net of ~2.2 s `cypher-shell` startup)

| Query | Net time |
|---|---|
| Existing `SEARCH_QUERY` shape (collect all ingredients for every recipe, score, sort, then cursor and `LIMIT`) | ~3.8 s |
| Existing filtered `COUNT_QUERY` | ~0.5–1.1 s, run on every page |
| Prototype: start from the included ingredients, count matches per recipe, take the degree as total ingredients | ~0.9–1.1 s (3 rare, 3 common and 5 very common ingredients) |

- `Ingredient.name` and `Recipe.id` already have uniqueness indexes (`ingredient_name_unique`, `recipe_id_unique`). More indexing on ingredient names will not help; the cost is touching every recipe, not finding ingredients.
- Recipes average 9 ingredients; every recipe has at least one. "onion" alone appears in 39,065 recipes, and a three-ingredient search touches about 53,000.
- Recipes with no overlap legitimately rank among the results (missing = total ingredients, matched = 0), so "only search recipes that use the ingredient" would change results and is not acceptable.

## Design

1. **Candidates plus remainder.** For a search, compute scores only for recipes reachable from `$included` and `$excluded` ingredient nodes (matched, excluded matches, and total ingredients from relationship degree). Recipes with no overlap have matched 0, excluded 0, missing = total ingredients, so they are read in order from a new range index on `Recipe.ingredientCount` (then `id`) and anti-joined against the candidates, stopping once the page is full. Merge both ordered streams with the existing comparator. The existing rank-order check in the repository stays.
2. **Graph change.** Store `ingredientCount` on `Recipe` and create `recipe_ingredient_count` on `(ingredientCount, id)` in the import and in a migration script alongside `scripts/migrate-account-schema.ts`. Record completion with the existing import-completion approach so an older graph is detected. When missing, fall back to the current query.
3. **Cache.** A bounded in-process cache with a **sliding 1-minute expiry**: every hit (a new page of the same search) resets the entry's timer, and an entry is removed once 1 minute passes with no request for it. Expiry is checked lazily on access plus a periodic sweep on an unref'd timer so idle entries free memory without keeping the process alive. Max ~20 entries and max candidate rows per entry, evicting least recently used first keyed by the existing criteria fingerprint plus the graph import identifier. It stores the compact scored candidate list and the filter-only `totalCount`; pages are cut from it with the cursor position. Per-account state is never cached. The key is the deduplicated, sorted canonical `included`, `excluded`, `excludedCategories` and `cuisines` plus the graph identity (the existing `recipeSearchFingerprint` inputs **minus `maxMinutes`**), so "chicken, garlic" and "garlic, chicken" share one entry. The entry holds the whole scored candidate list, not a page, so any person at any page position (first page or any cursor) is served from it. The cursor is not part of the key. **`maxMinutes` is applied in memory:** filters only hide recipes and never change a recipe's score, so filtering the ranked list preserves rank order. Each cached row carries `minutes`; a page scans forward from the cursor position skipping rows above the limit (and continues into the remainder stream when candidates run out). Changing the time limit therefore reuses the same entry. The cursor itself is still bound to the full criteria including `maxMinutes`, so cursor reuse with different criteria still returns the existing client error. `totalCount` depends on filters but not on ingredients, so it is cached separately keyed by the filters alone (including `maxMinutes`). This is a performance cache only, so a miss or error recomputes. Sliding expiry cannot serve stale data because ranking depends only on the static graph, and the key includes the graph import identity; the entry and size caps bound memory for a user who keeps scrolling.
4. **Why not only a cache?** A cache alone leaves the first search at ~4–5 s and costs memory for ~231k scored rows per distinct search. It is layered on top of the query change, not instead of it.
5. **Why not only the query?** Each page would still repeat ~1 s of aggregation; the cache removes that for scrolling.

## Code Map

- `api/src/infrastructure/neo4j/queries/recipes.queries.ts` -- current `SEARCH_QUERY` and `COUNT_QUERY` to be reworked.
- `api/src/infrastructure/neo4j/repositories/recipes.neo4j.repository.ts` -- runs count and search sequentially and verifies rank order; add stream merge and fallback.
- `api/src/core/recipes/recipe-search.cursor.ts` -- fingerprint, position comparator and cursor; reuse unchanged.
- `api/src/application/services/` -- home for the cache policy behind a core port; composition in `api/src/app.ts` and `api/src/index.ts`.
- `scripts/import-data.ts` -- writes `Recipe` and `USES`; add `ingredientCount` and the index.
- `scripts/migrate-account-schema.ts` -- model for an idempotent migration of an existing graph.
- `README.md` -- document the migration step and cache behavior.

## Tasks & Acceptance

**Execution:**
- [ ] `api/` -- Add a reproducible benchmark (fixed ingredient sets: rare, common, mixed, with exclusions, filters, deep pages) and record baseline timings before changing anything -- the PRD target is unvalidated and must be measured.
- [ ] `api/`, `scripts/` -- Add the `ingredientCount` property and `recipe_ingredient_count` index to the import and an idempotent migration; record completion; detect an older graph and fall back.
- [ ] `api/` -- Implement the candidate-plus-remainder query and merge behind the existing repository port with unchanged contracts.
- [ ] `api/` -- Add the bounded TTL cache behind a core port, keyed by criteria fingerprint and graph identity, with safe fallback.
- [ ] Tests -- Equivalence tests proving old and new queries return identical pages, `totalCount` and cursors across the benchmark sets, including no-overlap recipes, exclusions, category and cuisine filters, `maxMinutes`, deep pagination and cursor mismatch; cache hit across different input order, duplicates and page positions (a miss when included, excluded, categories or cuisines differ, a hit with only `maxMinutes` changed with identical pages to the database-filtered result), cache hit, sliding-expiry (hit resets timer, idle entry removed after 1 minute, using fake timers), eviction and fallback tests.
- [ ] `README.md` -- Document migration, cache expiry and how to run the benchmark.

**Acceptance Criteria:**
- Given any request in the benchmark set, when the new path runs, then recipes, order, `totalCount` and `nextCursor` equal the existing query's results page by page.
- Given a typical first search on the full dataset, when measured with the benchmark, then it is meaningfully faster than the recorded baseline and the result is reported against the ~1 s PRD target (the target is confirmed or revised from the measurement, not assumed).
- Given a warm cache, when the next page is requested, then it is served without re-aggregating candidates; after 1 idle minute, eviction or restart it is recomputed with identical results.
- Given a graph without the new property or index, when search runs, then results are still correct and the need for migration is reported.
- Given a re-import, when search runs, then no stale cached results are served.

## Open Questions (need a decision before approval)

1. **Size (decided):** sliding 1-minute TTL and 20 entries. A per-entry row cap is still to be set from the benchmark. The cache stays in-process behind a core port; Redis was considered and rejected for now (extra service and cost for a single API instance), and the port allows adding it later.
2. **Graph change:** is adding `Recipe.ingredientCount` plus an index acceptable (needs a migration for existing local and demo graphs), or must the graph stay untouched, which means the first page stays near ~1 s but remainder ordering is slower?
3. **First-page target:** is "about 1 s" still the goal, or is a slower first search with a loading state acceptable on the client (the Android side will add loading text either way)?

4. **Open:** should cuisines and excluded categories also move in memory later? That needs per-row cuisine sets and an ingredient-to-category lookup (more memory per entry); version 1 keeps them in the key.

## Verification

**Commands:**
- `npm run check` -- expected: lint, typecheck and all tests pass.
- Benchmark command (added by this work) -- expected: before/after timings and an equivalence report with no differences.
- Migration run against a copy of an existing graph -- expected: idempotent, records completion, fallback no longer used.
