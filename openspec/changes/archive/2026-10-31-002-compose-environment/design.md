# Design

## Context

See `proposal.md` for motivation and `specs/local-compose-environment/spec.md` for the behavior contract. The repository has an existing TypeScript importer that reads `data/prepared/`, reads Neo4j connection settings from environment variables, and refuses to import into a non-empty graph. The current documented local setup starts Neo4j with `docker run` and invokes the importer separately. The repository already ignores `.env` files and local prepared data.

## Goals / Non-Goals

**Goals:**
- Keep the prepared CSV contract and importer unchanged while making them usable from Compose.
- Ensure database readiness, bounded host exposure, and explicit local credential setup.
- Keep the database persistent across normal stops while making intentional rebuilds explicit.

**Non-Goals:**
- Add an API, frontend, web proxy, or cloud deployment.
- Download or prepare the dataset automatically as part of container startup.
- Make imports incremental, destructive, or atomic across the full dataset.

## Decisions

### Compose coordinates Neo4j and a one-shot importer

Define a Neo4j Community service and a small importer service built from the existing Node project. The importer runs the existing `npm run import:data` command and receives `data/prepared/` as a read-only mount. Use the existing package lockfile for a reproducible image build; exclude local datasets, dependencies, and build output from the Docker build context so private/large inputs are not copied into the image.

Use Neo4j's health status as the importer dependency condition. The importer connects to the Neo4j service name on the private Compose network, while the database's Bolt port, if published for local development and tests, binds only to loopback. Keep the existing documented Neo4j 5.26 Community baseline and explicit memory limits.

**Alternative considered:** Continue documenting `docker run` and manual import commands. This preserves current setup but does not provide the requested coordinated, reproducible workflow.

### Supply credentials through an ignored local environment file

Require a developer-provided `NEO4J_PASSWORD`, document copying a tracked `.env.example` to `.env`, and pass the same credential to Neo4j initialization and the importer. The existing ignore rules already exclude `.env`; keep secrets out of Compose YAML, Docker build arguments, and image layers.

**Alternative considered:** Commit a development password as a Compose default. This is simpler for first launch but violates the repository's no-secrets constraint and encourages unsafe reuse.

### Preserve graph data and make reset deliberate

Store Neo4j state and Compose import state in named volumes so normal container stops do not erase the graph or its initialization status. A small importer entrypoint checks for a completion marker before invoking the existing importer. On the first run, it writes the marker only after the importer exits successfully; failed or partial imports leave no marker and therefore still reach the importer's existing empty-database guard on retry. Direct importer commands bypass the marker and retain the fresh-graph guard.

The marker and database volumes must be treated as a pair. Document intentional resets with a single Compose operation that removes both volumes; removing only one can make their state inconsistent.

**Alternative considered:** Clear or recreate the database automatically before import. This risks losing local data and bypasses the importer's existing safety contract. Re-running the importer unconditionally on each startup also fails against a successfully persisted graph and makes ordinary restarts unsuccessful.

### Validate the full local path without changing application contracts

Validate Compose configuration with Docker Compose and verify startup/import against a small prepared fixture in a disposable graph. Keep existing importer unit and integration tests as coverage for CSV validation and the fresh-graph guard; do not add a new runtime dependency solely for orchestration.

**Alternative considered:** Test only YAML shape or service names. That would not verify health ordering, credential wiring, or that the existing importer can reach the database.

## Risks / Trade-offs

- [The full local dataset may exceed available Docker memory] -> Keep Neo4j memory limits explicit and document that Compose startup requires prepared local data and sufficient resources.
- [A failed batch can leave a partially populated graph] -> Preserve the importer's fresh-graph guard and document that an intentional rebuild requires explicit removal of the local database volume; never auto-clear it.
- [The completion marker and Neo4j data volume can become inconsistent if removed independently] -> Manage them as a pair and document a reset command that removes both together.
- [A developer may expose Neo4j on a non-local interface] -> Bind any published host port to loopback and validate the resolved Compose configuration.
- [The Compose completion marker may be mistaken for permission to overwrite data] -> The marker only skips a previously completed Compose import; it never changes the importer's behavior for direct invocations or unmarked populated databases.

## Migration Plan

Replace the documented disposable `docker run` plus manual importer sequence with the Compose startup workflow, while retaining direct importer instructions for dedicated Neo4j instances and integration tests. No graph migration is required. Existing local container data is not automatically migrated or removed; the developer may keep using that instance or choose a fresh Compose volume.
