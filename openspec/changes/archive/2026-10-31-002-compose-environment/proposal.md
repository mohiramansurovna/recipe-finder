# Proposal

## Why

R0 already prepares graph-ready CSVs and provides a Neo4j importer, but starting the database and loading data currently requires a manual container command followed by a separate import command. A reproducible local Compose workflow makes the foundation easier to run and verify, satisfying the PRD's R0 and one-command reproducibility goals.

## What Changes

- Create a local Docker Compose environment for Neo4j and an importer that loads the existing prepared CSVs after Neo4j is ready, then skips re-import on later starts only when a previous Compose-managed import completed successfully.
- Define the local data, configuration, and credential inputs without committing dataset files or secrets; keep the database off public interfaces.
- Document prerequisites, startup, data preparation, repeat-start behavior, and the fresh-database guard for direct or unrecognized imports.
- Add focused validation for the Compose configuration and its startup/import behavior.
- Do not add application/API or web services; those belong to later roadmap changes.

## Capabilities

### New Capabilities
- `local-compose-environment`: Run the local Neo4j-backed data environment and import prepared graph data through Docker Compose.

### Modified Capabilities
- None.

## Impact

- **Created from scratch:** Docker Compose configuration and any small container support files needed for the Neo4j/import workflow, including durable state for recognizing a successful Compose-managed import.
- **Modified:** README and data-preparation documentation to describe the supported Compose workflow; focused tests or checks for its behavior.
- **Reused:** `scripts/import-data.ts`, `npm run import:data`, and the existing `data/prepared/` CSV contract.
- **Systems:** Docker Compose and Neo4j Community; no new application runtime service, cloud infrastructure, or external runtime API.
- **PRD alignment:** R0 Compose environment and NFR reproducibility/security. Existing data preparation/import behavior remains governed by `data-prep-and-import`.
- **Non-goals:** API, frontend, Caddy, cloud deployment, committed data, automatic Kaggle downloads, importer replacement/rollback behavior, and changes to the existing graph data contract.
