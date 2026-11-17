---
title: 'Store Ratings Anonymously'
type: 'refactor'
created: '2026-11-17'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'cb373c7a2b11a1c68515e4ce3ca57eca6b9f4607'
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/docs/prd.md'
  - '{project-root}/docs/api-contract.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A `Rating` node stores `accountId`, `recipeId`, `id` and `updatedAt` as properties. Account deletion strips `accountId` and replaces `id`, but `recipeId` and `updatedAt` stay on retained ratings, and the identity lives in the data model rather than only in a removable link.

**Approach:** A rating stores only its numeric `value`. Which account owns it, and which recipe it belongs to, is expressed only by relationships. Deleting an account deletes its ownership link, leaving an ownerless rating that carries no account data. The HTTP contract does not change.

## Boundaries & Constraints

**Always:** Keep the API contract and behavior: one rating per account per recipe, update instead of duplicate, whole-number 1–5, authenticated reads and writes, ratings combined with source ratings, no identity exposed. Keep recipe detail ratings unchanged. Migration is idempotent and recorded. Keep personal data and datasets out of Git.

**Never:** Store an account identifier, recipe identifier copy, timestamp, text or any other property on a rating; expose or log which account owns which rating; remove source (dataset) ratings.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Set rating | Account rates a recipe, no existing rating | One `Rating {value}` linked from the recipe and owned by the account | Unknown recipe is `RECIPE_NOT_FOUND` |
| Update rating | Account rates the same recipe again | The existing rating's `value` changes; still one rating | -- |
| Remove / get rating | Own rating | Found by traversing account → rating ← recipe; deleted or returned | -- |
| Account deletion | Account with ratings | Account, sessions, favorites and ownership links are removed; ratings remain with only `value` and the recipe link | Existing deletion errors unchanged |
| Existing graph | Ratings with old properties | Migration removes `accountId`, `recipeId`, `id`, `updatedAt` and the `rating_id_unique` constraint, keeping links and values | Safe to re-run |

</frozen-after-approval>

## Design

- Model: `(Recipe)-[:HAS_RATING]->(Rating {value})` and `(Account)-[:HAS_RATING]->(Rating)`. Lookup is the path `(Account {id})-[:HAS_RATING]->(r)<-[:HAS_RATING]-(Recipe {id})`. Renaming the account link is out of scope.
- Caveat to document: while an account exists the database still links it to its ratings; anonymity is enforced at the API and becomes permanent after deletion.
- Consequence: the time a rating was made can no longer be shown or used.
- Order of work: this lands before the rating-average maintenance in `spec-search-latency.md`.

## Code Map

- `api/src/infrastructure/neo4j/repositories/accounts.neo4j.repository.ts` -- `setRating`, `removeRating`, `getRating` and account deletion (`~860–1010`).
- `api/src/infrastructure/neo4j/account-schema.ts` -- remove `rating_id_unique`.
- `scripts/migrate-account-schema.ts` (or a new migration) -- idempotent property and constraint removal.
- `docs/api-contract.md`, `README.md`, `docs/prd.md` (FR-16 updated) -- privacy and migration notes.

## Tasks & Acceptance

**Execution:**
- [ ] `api/` -- Rewrite rating queries around the relationship path; create a rating with only `value`; remove `id`/`accountId`/`recipeId`/`updatedAt` use.
- [ ] `api/` -- Simplify account deletion to delete the ownership link without rewriting rating properties.
- [ ] `scripts/` -- Add the idempotent migration and drop the constraint.
- [ ] Tests -- Create, update (still one rating), remove, get, other accounts unaffected, source ratings untouched, deletion leaves value-only ratings, migration idempotent.

**Acceptance Criteria:**
- Given any rating in the graph after migration, when its properties are listed, then only `value` exists.
- Given an account with ratings is deleted, then no relationship or property can identify it, and the recipe's combined rating is unchanged.
- Given the existing rating API tests, when run, then they pass without contract changes.

## Verification

**Commands:**
- `npm run check` -- expected: all tests pass.
- Migration run on a copy of an existing graph -- expected: rating nodes have only `value`; re-run changes nothing.
