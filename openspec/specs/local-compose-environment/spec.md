# local-compose-environment Specification

## Purpose

Provides a repeatable local environment for starting Neo4j, loading prepared graph data, and serving the API through local Caddy without exposing the database beyond the developer's machine.

## Requirements

### Requirement: Start the local graph environment
The local environment SHALL start Neo4j and load the prepared graph data through one documented Compose startup workflow.

#### Scenario: Start with prepared data available
- **GIVEN** the required prepared CSV files and local database credentials are available
- **WHEN** the developer starts the Compose environment
- **THEN** Neo4j becomes ready and the prepared recipes, ingredients, and relationships are loaded without a separate manual import command

#### Scenario: Prepared data is unavailable or invalid
- **WHEN** the import service cannot read or validate the prepared CSV files
- **THEN** startup reports the import failure and does not report a successful data load

### Requirement: Wait for database readiness and surface import failures
The local environment SHALL run the data import only after Neo4j is ready and SHALL expose unsuccessful imports as a failed Compose operation.

#### Scenario: Neo4j is still starting
- **WHEN** the import service is scheduled before Neo4j has completed startup
- **THEN** the import waits until Neo4j reports readiness before connecting

#### Scenario: Database connection or import fails
- **WHEN** the importer cannot connect or a graph write fails
- **THEN** the Compose workflow exits unsuccessfully and presents the importer error rather than indicating that setup completed

### Requirement: Restart after a successful Compose import
Compose startup SHALL skip importing only when a persistent record confirms that a previous Compose-managed import completed successfully.

#### Scenario: Restart with a completed Compose import
- **GIVEN** the graph and its successful-import record are both retained
- **WHEN** the developer starts the Compose environment again
- **THEN** Neo4j becomes ready, the importer is skipped, and existing graph data remains unchanged

#### Scenario: Start with an unmarked non-empty graph
- **GIVEN** the target graph contains data but has no record of a successful Compose-managed import
- **WHEN** the Compose startup workflow attempts to import prepared data
- **THEN** the existing fresh-database guard reports failure and leaves the graph data intact

### Requirement: Keep the local database private
The local environment SHALL restrict host access to Neo4j to the local machine and SHALL NOT expose the database to external network interfaces.

#### Scenario: A local developer connects to Neo4j
- **WHEN** the environment is running on the developer's machine
- **THEN** the import service can connect over the private Compose network and any host-published database port is bound only to loopback

#### Scenario: Another machine attempts to reach Neo4j
- **WHEN** a client connects through a non-local network interface
- **THEN** the local Compose environment does not expose Neo4j on that interface

### Requirement: Serve and verify the API locally
The local environment SHALL route API requests through Caddy and SHALL report API health only after the guarded data import has completed.

#### Scenario: Start the API after successful import
- **GIVEN** Neo4j is healthy and the prepared-data import completed successfully
- **WHEN** the local Compose environment starts the API
- **THEN** Caddy proxies API requests to the healthy API without a web-client build or asset volume

#### Scenario: Verify local API readiness
- **WHEN** the developer checks API readiness
- **THEN** the health endpoint and recipe-search API are reachable through local Caddy

### Requirement: Protect credentials and existing graph data
The local environment SHALL use developer-supplied credentials without embedding secrets in tracked files and SHALL NOT silently replace data in a non-empty graph.

#### Scenario: Start with local credentials
- **WHEN** the developer configures the required database credential locally
- **THEN** Compose passes it to Neo4j and the importer without requiring a committed secret

#### Scenario: Import into a non-empty graph
- **WHEN** the import service targets a database that already contains graph data
- **THEN** the import fails with a fresh-database error and leaves existing graph data intact
