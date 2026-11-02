# Tasks

## 1. Search API and graph repository

- [x] 1.1 Define typed recipe-search criteria, result, and repository contracts; verify the contract with focused unit tests for matched, missing, and excluded ingredient details.
- [x] 1.2 Implement Neo4j recipe matching, rank ordering, time limits, and keyset cursor pagination; verify unit tests cover rank ties, unknown times, malformed or mismatched cursors, and page boundaries.
- [x] 1.3 Add the validated `POST /api/recipes/search` route and explicit error mapping; verify Supertest covers valid requests, invalid criteria, cursor errors, and graph failures.
- [x] 1.4 Preserve ingredient parsing behavior while adding search; verify `npm test -- tests/ingredient-parser.test.ts` passes.

## 2. Search results interface

- [x] 2.1 Add a validated web API client and connect submitted parsed criteria to first-page recipe searches; verify UI tests assert the search request carries included ingredients, exclusions, and the selected time limit.
- [x] 2.2 Add recipe cards, time-limit controls, and distinct loading, empty, and retryable error states; verify UI tests cover displayed details and update `docs/architecture.md` to describe the implemented search flow.
- [x] 2.3 Refresh results after chip or time-limit changes, guard against stale responses, and reset pagination for new criteria; verify UI tests prove the newest criteria determine the displayed results.
- [x] 2.4 Add cursor-based continuous loading with a keyboard-operable Load more fallback; verify UI tests confirm pages append in order without duplicate recipes.

## 3. End-to-end verification

- [x] 3.1 Add and run a Neo4j search integration test against an isolated test graph; verify ranking, exclusion penalties, time limits, and cursor traversal without touching the developer's Compose data.
- [x] 3.2 Run `npm run check`, `npm run build:api`, and `npm run build:web`; verify the application checks and both production builds succeed.
