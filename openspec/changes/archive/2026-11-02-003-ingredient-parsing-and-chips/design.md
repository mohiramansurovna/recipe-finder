# Design

## Context

See `proposal.md` for motivation and `specs/ingredient-parsing-and-chips/spec.md` for the behavior contract. The repository currently has a TypeScript/Vitest project, a Neo4j driver and graph importer, and a Compose stack for Neo4j plus import. It has no application API or web frontend. Prepared ingredient names are normalized and stored as `Ingredient` nodes. This change introduces the first API and browser UI; recipe search is reserved for change 004.

## Goals / Non-Goals

**Goals:**
- Keep parsing deterministic and independently unit-testable.
- Use the graph's ingredient names as the vocabulary, so recognized terms reflect the imported dataset.
- Provide a usable parse-and-edit flow, including keyboard-accessible chips.
- Integrate the new API and web UI into the local Compose environment without exposing Neo4j beyond its existing loopback binding/private network.

**Non-Goals:**
- Retrieve or refresh recipe results, rank recipes, paginate, or filter by time.
- Add aliases, typo tolerance, ingredient categories, or category-wide exclusions.
- Add accounts, contributor data, LLM calls, or other runtime external services.

## Decisions

### Parse against a supplied vocabulary with a pure matching function

Implement parsing as a pure TypeScript function that accepts text and a set of normalized ingredient names. Normalize user input with case folding and mechanical whitespace/punctuation handling consistent with the existing ingredient normalization; match known multi-word names as complete phrases, preferring the longest match. Recognize explicit ingredient negation such as “no butter” and “without butter.” Return unmatched meaningful terms as unrecognized instead of silently discarding them. Do not infer aliases, fuzzy matches, or category membership.

This keeps the parser easy to test without Neo4j and avoids making database access part of parsing behavior. A small documented set of query examples should pin down handling of conjunctions, introductory filler, punctuation, and unmatched terms.

**Alternative considered:** Match individual tokens or use fuzzy string similarity. Token matching creates false positives for multi-word names; fuzzy matching adds behavior reserved for R2 and can make results unpredictable.

### Load recognized vocabulary from Neo4j through the API

The API obtains ingredient names from `Ingredient` nodes using the existing Neo4j driver, then supplies that vocabulary to the pure parser. Expose a read-only vocabulary endpoint for the add-chip control and a parse endpoint for text submission. Validate request bodies with Zod, return client errors for invalid input, and report graph connectivity or query failures as service errors rather than an empty/success-shaped result. Reuse the existing driver instead of introducing a second data source that could drift from the imported graph.

**Alternative considered:** Bundle the prepared CSV into the web build. The current build/deployment flow does not make local prepared data a frontend build input, and bundling dataset-derived values into static assets complicates updates and leaks the source of truth away from the graph.

### Keep chip edits in client state until search exists

The browser displays separate included, excluded, and unrecognized groups. Removing or toggling a recognized chip updates the current criteria; adding a chip selects a name from the vocabulary endpoint and adds it to the included group. Unrecognized text remains visible and removable, but is not treated as a recognized search ingredient. No chip operation calls a recipe-search endpoint in this change. Change 004 will consume the edited criteria and refresh results.

**Alternative considered:** Return placeholder recipes or wire chip actions to an incomplete search route. Either approach would present results that do not satisfy the ranking and result requirements of change 004.

### Add only the dependencies needed for the planned application surfaces

Follow the documented Express, TypeScript, Zod, React, and Vite stack. Add Supertest for API integration tests and a standard Express rate-limit middleware to enforce the existing public-API rate-limit constraint. Keep Vitest for parser and component/API tests. Reuse `neo4j-driver`, `csv-parse` where appropriate, and existing project tooling; do not add a matching, NLP, or runtime LLM dependency.

Use a DOM test environment and React Testing Library for keyboard and interaction tests. Serve the browser application and reverse-proxy `/api` through Caddy as specified in the architecture, and add the API/web/proxy services to Compose alongside the existing database/importer. Keep Neo4j reachable only from the private Compose network and preserve its loopback-only host binding. Include a visible dataset credit in the UI without contributor identities.

**Alternative considered:** Use an unbounded custom rate limiter or expose the API directly from a development server. A standard middleware has clearer request-limit behavior, while the documented proxy path keeps the local app aligned with the deployment architecture.

## Risks / Trade-offs

- [Exact vocabulary matching will miss aliases, misspellings, and some natural phrasing] → Keep unmatched terms visible and editable; add alias/typo handling in R2.
- [A graph outage could make parsing and ingredient selection unavailable] → Fail requests explicitly, keep parser logic pure, and report readiness/connection failures rather than returning empty vocabulary.
- [Negation and free-form text can be ambiguous] → Specify and test a small supported grammar; treat unsupported broad exclusions as unrecognized, never as inferred ingredient exclusions.
- [The current Compose flow requires prepared local data and Neo4j credentials] → Reuse the established setup and document the added application services without changing the existing import/reset safety behavior.

## Migration Plan

No persisted user state or graph schema changes are required. Add the application services and proxy configuration to the existing Compose setup; existing database and import volumes remain unchanged. Validate the existing importer flow as well as startup and API/UI behavior with the application stack. Rollback consists of reverting the application services and related files; no graph migration or data deletion is needed.
