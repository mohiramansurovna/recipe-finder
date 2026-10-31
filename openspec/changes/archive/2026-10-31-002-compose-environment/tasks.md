# Tasks

## 1. Container packaging and orchestration

- [x] 1.1 Add a minimal Node importer image and Docker build-context exclusions; verify it builds from the lockfile without including local raw/prepared datasets.
- [x] 1.2 Define Neo4j and importer services, health-gated startup, a persistent database volume, loopback-only Bolt publishing, and required local credentials; verify `docker compose config` with a local password and confirm the resolved port is loopback-bound.
- [x] 1.3 Mount the configured prepared-data directory read-only for the importer, defaulting to `data/prepared/`; verify the resolved Compose configuration points to the expected directory and does not permit container writes to the source files.
- [x] 1.4 Add an importer entrypoint with a persistent Compose completion marker; verify it skips only when the marker exists and writes the marker only after a successful import.

## 2. Local setup and documentation

- [x] 2.1 Add a tracked credential example and document local `.env` setup, prepared-data prerequisites, repeat-start behavior, persistence, and a deliberate reset that removes both database and marker volumes; verify every documented command and environment variable matches the Compose configuration.
- [x] 2.2 Preserve instructions for direct imports and integration tests against dedicated Neo4j instances; verify the existing importer and integration-test workflows remain documented and unchanged.

## 3. Integration verification

- [x] 3.1 Start the Compose environment with `tests/fixtures/prepared` and disposable volumes; verify Neo4j readiness, expected fixture nodes and relationships, successful restart with import skipped, failure for a populated graph without a completion marker, preservation of existing data, and successful `npm run check`.
