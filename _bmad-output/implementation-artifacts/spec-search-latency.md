---
title: 'Faster Recipe Search with Rating Filter'
type: 'feature'
created: '2026-11-17'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'cb373c7a2b11a1c68515e4ce3ca57eca6b9f4607'
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/docs/prd.md'
  - '{project-root}/README.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-rating-anonymity.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `POST /api/recipes/search` takes several seconds per page on the full dataset (231,636 recipes, 2.1M `USES` edges) because it scores every recipe, including recipes with no matching ingredient, and runs a separate count query. The Android client now pages automatically, so every page pays that cost again. Ranking also surfaces recipes with no match, and tiny recipes, ahead of useful ones.

**Approach:** Search only recipes that use at least one included ingredient. The database returns compact match counts for those candidates; a Redis cache keeps them while they are in use (5 idle minutes, 1 day at most); the service sorts and applies the cooking-time and minimum-rating filters in memory. Ranking becomes most matched, then fewest missing, then recipe ID. This is an approved behavior change recorded in `docs/prd.md` (FR-3, FR-4); the route is not versioned.

## Boundaries & Constraints

**Always:** Keep routes, error envelope, validation style, rate limits, database privacy and the criteria-bound cursor concept. Keep feature logic in application services behind core contracts; routes do not query Neo4j; adapters implement ports wired at the composition root. Rank order is deterministic. Any graph change is applied by the import and an idempotent migration, and recorded so an older graph is detected. Keep datasets, secrets and deployment state out of Git.

**Never:** Cache per-account data, move sessions, refresh tokens or rate limits out of Neo4j, cache across a graph re-import, expose the database, or provision AWS resources as part of this work. Do not edit archived or existing specs.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Normal search | One or more included ingredients | Recipes using at least one included ingredient, ordered by matched (desc), missing (asc), ID (asc); `totalCount` is the number of results after all filters | Graph unavailable is an error, never an empty success |
| No included ingredient | Empty or absent `included` (including only excluded terms) | None | Explicit client error naming that ingredients are required |
| Excluded ingredient | A recipe uses any `excluded` ingredient | Recipe is omitted | -- |
| Excluded category | A recipe uses an ingredient in an excluded category | Recipe is omitted (unchanged) | -- |
| Cuisines | Selected cuisines | OR semantics, as today | -- |
| `maxMinutes` | Supported limit | Recipes above the limit omitted; recipes with no time are omitted | -- |
| `minRating` | 3 or 4 | Recipes with combined rating below it, or no rating, omitted; order unchanged | On a graph not yet migrated for ratings: explicit unavailable error; other searches still work |
| Rating not requested | No `minRating` | Unrated recipes remain in results | -- |
| Later page | Cursor from the same criteria | Next page of the same ordering; served from cache when warm, correct when cold | Cursor for different criteria or an old-format cursor: existing client error |
| Same search, different wording | "chicken, garlic" vs "garlic, chicken", duplicates | Same cache entry and same results | -- |
| Only `maxMinutes` or `minRating` changes | Same ingredients | Same cache entry, different in-memory filter | The cursor is bound to all criteria, so a cursor from the other filter value is rejected |
| Cache expiry, eviction or Redis down | No request for the entry for 5 minutes, older than 1 day, evicted by `maxmemory`, Redis restarted or unreachable | Recomputed with identical results | Cache failure falls back to the uncached query; never an error |

</frozen-after-approval>

## Evidence (measured 2026-11-17, local Neo4j, net of ~2.2 s `cypher-shell` startup)

| Query | Net time |
|---|---|
| Existing `SEARCH_QUERY` (collect ingredients for every recipe, score, sort, then cursor and `LIMIT`) | ~3.8 s |
| Existing filtered `COUNT_QUERY`, run on every page | ~0.5–1.1 s |
| Prototype: start from included ingredient nodes, count matches per recipe, use relationship degree as the recipe's total | ~0.9–1.1 s (3 rare, 3 common, 5 very common ingredients) |

**Baseline (`npm run benchmark:search`, current implementation, 2026-11-17, local Neo4j, median of 3, one page of 20 including the count query):**

| Scenario | Median |
|---|---|
| rare x1 / common x1 | 6.3 s / 6.3 s |
| common x3 / very common x5 / mixed rare+common | 5.2 s / 5.3 s / 5.3 s |
| exclusions (1 ingredient + 1 category) | 27.5 s |
| cuisine + maxMinutes filter | 1.0 s |
| 5 pages in a row (100 recipes) | 25.1 s |

**After (`BENCHMARK_RUNS=5`, 2026-11-17, same local Neo4j, no cache, median ms; each deep-pages page re-queries because the benchmark bypasses Redis):**

| Scenario | Median | Rows |
|---|---|---|
| rare x1 | 18 | 3 |
| common x1 ("onion") | 489 | 39,065 |
| common x3 / very common x5 / mixed rare+common | 1,241 / 1,618 / 1,062 | up to 153,889 |
| exclusions (1 ingredient + 1 category) | 2,935 | - |
| filters | 443 | - |
| 5 pages in a row | 5,683 (about one query when cached) | - |

- No duplicate `USES` edges exist, so `missing = degree - matched` is exact.
- Largest measured cache entry (5 very common ingredients, 153,767 rows): 3.5 MB JSON, 1.0 MB gzipped. An entry cannot exceed the 231,636 recipes (about 1.6 MB), so no per-entry row cap is added; Redis `maxmemory` with `allkeys-lru` bounds the total.
- The ~1 s target holds for typical first searches (up to three ingredients). Five very common ingredients take about 1.6 s and the exclusion scenario 2.9 s; both are cold-cache costs and later pages are served from Redis. Exclusion cost is the open follow-up.

- `Ingredient.name` and `Recipe.id` are already uniquely indexed. The cost is the old query starting from every recipe, not finding ingredients.
- Recipes average 9 ingredients; "onion" alone is in 39,065 recipes and a three-ingredient search touches ~53,000. That bounds the candidate list and the memory per cache entry.
- No graph change is needed for the search itself. The only graph change is the rating average below.

## Design

1. **Candidate query (database).** From the included ingredient nodes, count per recipe: `matched` (distinct included ingredients used) and `total` (`COUNT { (recipe)-[:USES]->() }`), so `missing = total − matched`. Apply excluded ingredients and excluded categories and cuisines in this query (all hide recipes). Return `id`, `matched`, `missing`, `minutes`, `ratingAverage` per candidate. No `ORDER BY` and no `LIMIT` in the database.
2. **Service (memory).** Filter by `maxMinutes` and `minRating`, sort by `matched` desc, `missing` asc, `id` asc, compute `totalCount` as the filtered size, and cut the page after the cursor position. Then fetch names and ingredient lists for the page's ≤20 IDs with one lookup by ID (index) for the response, so cached rows stay compact. The old count query and rank-order check against the database are removed; the service asserts its own ordering in tests.
3. **Cursor.** Position is `(matched, missing, id)` plus the fingerprint of all criteria (included, excluded, excluded categories, cuisines, `maxMinutes`, `minRating`). Cursor version moves to 2; version-1 cursors return the existing invalid-cursor error.
4. **Cache (Redis).** A Redis service shared by all API instances holds the candidate lists behind a core cache port, falling back to the uncached query when Redis is unavailable. Expiry is **sliding 5 minutes**: each hit refreshes the entry's TTL (`GETEX ... EX 300`), and Redis removes it after five minutes without requests. An **absolute maximum age of 1 day** (creation time stored in the entry and checked on read; an expired entry is deleted and rebuilt) applies even to an entry in continuous use. There is no rebuild on rating changes; rating averages inside an entry may be up to a day old (a recipe with thousands of ratings barely changes; a recipe near the 3 or 4 threshold may cross it up to a day late, which is accepted). Both limits are settings (`SEARCH_CACHE_IDLE_SECONDS`, default 300; `SEARCH_CACHE_MAX_AGE_SECONDS`, default 86400). There is no entry-count cap; memory is bounded by the TTL, a per-entry row cap (set from the benchmark) and a configured Redis `maxmemory` with `allkeys-lru` eviction, so a burst of distinct searches evicts the least recently used instead of failing. Entries are stored compactly (typed binary rather than JSON) to keep a ~50,000-row list to about a megabyte. Key is the deduplicated, sorted canonical `included`, `excluded`, `excludedCategories` and `cuisines` plus the graph identity (the cursor fingerprint minus `maxMinutes` and `minRating`), so word order, duplicates and page position never matter. `maxMinutes` and `minRating` are applied in memory after reading an entry so changing them reuses it. Per-account data is never cached. The cache only ever holds data derivable from the graph; a miss, Redis outage or flush recomputes and is never an error. Ranking depends only on the static graph, so the sliding window cannot serve stale scores; rating averages are at most the maximum age (1 day) old.
   **Not in Redis:** accounts, sessions, refresh-token hashes and rate-limit counters stay in Neo4j. Sessions last 30 days and rotate with replay detection inside a Neo4j transaction, and losing Redis must never sign anyone out.
5. **Rating average.** Store `ratingAverage` and `ratingCount` on `Recipe`, set by the import/migration and recomputed from the recipe's own ratings inside the same transaction whenever a rating is set or removed. The value equals what recipe detail shows: the average of individual values above 0, otherwise the dataset `aggregateRating`, otherwise null. Rating changes require the new rating model from `spec-rating-anonymity.md`, so that spec lands first.
6. **Infrastructure.** Redis is added to the local Compose files (cache only, no persistence required, `maxmemory` and `allkeys-lru` set). Adding it to the demo deployment is billable infrastructure and is out of scope until the README deployment review and explicit operator approval are complete.

## Code Map

- `api/src/infrastructure/neo4j/queries/recipes.queries.ts` -- replace `SEARCH_QUERY` and `COUNT_QUERY` with the candidate query and a lookup-by-ID query.
- `api/src/infrastructure/neo4j/repositories/recipes.neo4j.repository.ts` -- return candidates and page details; remove database-side ranking.
- `api/src/core/recipes/recipe-search.cursor.ts` -- fingerprint gains `minRating`; cursor version 2 with `(matched, missing, id)`.
- `api/src/core/recipes/` and `api/src/application/services/` -- sorting, filtering, paging and the cache port/policy; wired in `api/src/app.ts` and `api/src/index.ts`.
- `api/src/interface/http/schemas/recipes.schemas.ts` and `routes/recipes.routes.ts` -- `minRating` (3 or 4), required `included`, error text.
- `api/src/infrastructure/neo4j/repositories/accounts.neo4j.repository.ts` -- rating writes maintain `ratingAverage` and `ratingCount`.
- `scripts/import-data.ts` and a new idempotent migration modeled on `scripts/migrate-account-schema.ts` -- populate the rating fields and record completion.
- `docker-compose*.yml`, `.env` example and `README.md` -- Redis service, `REDIS_URL`, memory limit; `docs/api-contract.md` -- request/response notes.
- Android (`android/`) -- separate follow-up: first-search loading text and a minimum-rating control.

## Tasks & Acceptance

**Execution:**
- [ ] `api/` -- Add a reproducible benchmark (rare, common, mixed, exclusions, filters, deep pages) and record baseline timings before changing code.
- [ ] `api/` -- Implement the candidate query, in-memory sort/filter/paging, cursor v2 and `minRating`, with required `included` and the new error.
- [ ] `api/`, `scripts/` -- Add `ratingAverage` and `ratingCount` (import, idempotent migration, rating writes, completion record, unavailable error for `minRating` on an unmigrated graph).
- [ ] `api/` -- Add the Redis-backed sliding-expiry cache behind a core port, with Compose service, configuration and safe fallback.
- [ ] Tests -- Ordering (matched desc, missing asc, ID asc), no zero-match recipes, excluded ingredient and category hiding, cuisine OR, `maxMinutes` and `minRating` filters with unrated handling, `totalCount`, deep pagination, old cursor and criteria-mismatch errors, required-ingredient error; cache hit across word order, duplicates, page positions and changed time/rating filters, miss when ingredients, exclusions or cuisines differ, sliding TTL refresh on hit, expiry after five idle minutes, and rebuild after the 1-day maximum age even under continuous use (Redis integration test), memory-limit eviction, Redis-down fallback, sessions and rate limits unaffected.
- [ ] `docs/api-contract.md`, `README.md` -- document the new behavior, migration step and benchmark command.

**Acceptance Criteria:**
- Given any benchmark request, when searched, then results follow the new ordering and filters, and every page and `nextCursor` is consistent across pages.
- Given a typical first search on the full dataset, when measured with the benchmark, then it is reported against the recorded baseline and the ~1 s PRD target (confirmed or revised from the measurement).
- Given a warm entry, when later pages or changed time/rating filters are requested, then candidates are not re-queried; after five idle minutes, eviction or a Redis restart they are recomputed with identical results.
- Given a re-import, when search runs, then no cached results from the previous graph are served.
- Given no included ingredient, then the API returns the explicit client error.

## Verification

**Commands:**
- `npm run check` -- expected: lint, typecheck and all tests pass.
- Benchmark command (added by this work) -- expected: before/after timings.
- Migration run against a copy of an existing graph -- expected: idempotent, rating fields populated, completion recorded.
