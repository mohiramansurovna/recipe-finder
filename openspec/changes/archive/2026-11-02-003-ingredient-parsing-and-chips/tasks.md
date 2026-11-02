# Tasks

## 1. Parser and API

- [x] 1.1 Add the API and web application dependencies and build/test configuration from the documented stack; verify the lockfile installs and the configured TypeScript/Vite commands start successfully.
- [x] 1.2 Implement the pure ingredient parser and focused Vitest cases for included/excluded phrases, multi-word matches, punctuation, unsupported category exclusions, unmatched terms, and repeatable output; verify the parser unit tests pass.
- [x] 1.3 Implement vocabulary and parse API routes with request validation, explicit graph/service errors, and rate limiting; verify Supertest integration cases against a test graph cover parsing, vocabulary retrieval, invalid requests, and graph failures.

## 2. Editable ingredient interface

- [x] 2.1 Build the React parse-and-edit flow with separate included, excluded, and unrecognized chips, vocabulary-backed addition, accessible remove/toggle controls, and visible Food.com attribution; verify DOM tests exercise the main flow and keyboard actions without displaying contributor identities.

## 3. Local application integration

- [x] 3.1 Add the API, web, and Caddy services to the existing Compose setup while preserving Neo4j's private network and loopback-only host binding; verify `docker compose config` and a local stack smoke test with prepared data.
- [x] 3.2 Update the README and architecture documentation for starting the full local app, its required prepared data/credentials, the source attribution, and the absence of recipe results in this slice; verify the documented commands and URLs match the Compose configuration.
- [x] 3.3 Run the full repository check and regression tests for the existing importer/Compose behavior; verify the stack starts and the parse-and-edit flow works end to end without invoking recipe search.
