# Demo Deployment Specification

## Purpose

Defines the temporary, operator-managed AWS environment for demonstrating the private Recipe Graph API without a web client.

## Requirements

### Requirement: Publish API and importer images without cloud access

The image workflow SHALL publish revision-specific importer and API images to public GHCR packages using repository package permissions only. It SHALL NOT provision infrastructure, access AWS credentials, or publish web-client images.

#### Scenario: Publish an application revision

- **WHEN** the main branch, a release tag, or a manual publication run triggers the workflow
- **THEN** importer and API images are published for that source revision without AWS permissions or web assets

#### Scenario: Pull images on the demo host

- **WHEN** the operator launches a demo using a published revision
- **THEN** the host can pull its images anonymously and the selected image revision matches the checkout inputs validated by the launch process

### Requirement: Require operator preflight before provisioning

The launch workflow SHALL validate operator configuration, SSH access, prepared data, image revision, security review, estimated cost, and budget-alert details before provisioning a public server. It SHALL require explicit operator confirmation for billable resources.

#### Scenario: Launch with valid approved configuration

- **GIVEN** configuration and prepared data are valid, the security review is complete, and the estimate is within the configured budget
- **WHEN** the operator confirms the displayed provisioning action
- **THEN** the workflow creates the budget alert before the server and continues provisioning

#### Scenario: Reject invalid or unapproved configuration

- **WHEN** required configuration, current restricted SSH CIDR, prepared data, security review, or cost approval is missing or invalid
- **THEN** launch stops before creating a public server and reports the unmet precondition

### Requirement: Serve the API through protected public ingress

The demo SHALL expose the API through Caddy over HTTPS, restrict SSH to the operator's configured public address, and keep the API container and Neo4j private to the Compose network.

#### Scenario: Reach a ready API

- **GIVEN** data import succeeded and services are healthy
- **WHEN** a reviewer sends an API request to the reported HTTPS hostname
- **THEN** Caddy proxies the request to the API and the hostname presents a valid certificate

#### Scenario: Attempt direct access to private services

- **WHEN** an external client attempts to connect directly to Neo4j or the API container port
- **THEN** the connection is unavailable from the public internet

#### Scenario: Verify readiness

- **WHEN** launch checks service readiness
- **THEN** it confirms import completion, API health, and a successful recipe-search request before reporting success

### Requirement: Protect data, credentials, and deployment state

The deployment SHALL transfer prepared data only over verified SSH, keep secrets out of user data, tracked files, and published images, and retain local Terraform state until resource teardown is verified.

#### Scenario: Transfer prepared data

- **WHEN** prepared CSVs are sent to the demo host
- **THEN** they are transferred over a verified administrative connection without object storage or contributor identities

#### Scenario: Fail an unsafe transfer or startup

- **WHEN** host-key verification, data transfer, import, or service readiness fails
- **THEN** the workflow reports failure and does not claim the demo is ready

### Requirement: Remove and verify demo-owned resources

The teardown workflow SHALL remove and verify all resources owned by the demo stack and SHALL retain state when removal or verification is incomplete.

#### Scenario: Complete teardown

- **GIVEN** the operator has confirmed the exact demo stack
- **WHEN** teardown completes and AWS verification confirms no stack-owned resources remain
- **THEN** the command reports success and the demo is no longer reachable

#### Scenario: Teardown is partial or state is unavailable

- **WHEN** Terraform teardown fails or state is missing
- **THEN** the command reports remaining resources, preserves available state, and directs the operator to identify and remove only verified demo-owned resources

#### Scenario: Avoid unintended destruction

- **WHEN** a candidate resource is not verified as belonging to this demo
- **THEN** recovery instructions do not authorize deleting it
