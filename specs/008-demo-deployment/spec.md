# Feature Specification: Demo Deployment

**Feature Branch**: `008-demo-deployment`

**Created**: 2026-11-04

**Status**: Draft

**Input**: User description: "008-demo-deployment"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Launch a Demo (Priority: P1)

An operator wants to make the current Recipe Finder available for a demonstration without manually assembling the server or application. They run the documented launch action, provide the required access details, and receive a public address after the application and recipe data are ready.

**Why this priority**: A repeatable launch is the core purpose of the demo release; without it reviewers cannot use the live application.

**Independent Test**: Starting from a clean checkout with the documented prerequisites and prepared data, launch the demo and verify that the application is ready at its reported address.

**Acceptance Scenarios**:

1. **Given** the operator has configured cloud access, an SSH public key, an allowed SSH source address, and prepared recipe data, **When** they launch the demo, **Then** the deployment reports a public address only after the application and data import are ready.
2. **Given** the launch action is awaiting confirmation, **When** the estimated price exceeds the operator's configured limit or the required cost alert is unavailable, **Then** the operator is informed and the public demo server is not created.
3. **Given** image publication has completed for the selected application revision, **When** the demo is launched, **Then** the server uses images built from that revision and does not require cloud credentials in the image-publication workflow.

---

### User Story 2 - Review the Live Application (Priority: P2)

A reviewer opens the demo address in a browser and uses the existing ingredient-first recipe search over a secure connection, without needing an account or setup instructions.

**Why this priority**: A live, usable demonstration is the value delivered to reviewers by the deployment.

**Independent Test**: Open the reported address in a clean browser session, verify a secure connection, submit a representative ingredient search, and confirm recipe results are displayed.

**Acceptance Scenarios**:

1. **Given** the demo is ready, **When** a reviewer opens its public address, **Then** the application loads over HTTPS with a valid browser-trusted certificate.
2. **Given** the reviewer enters ingredients supported by the current application, **When** they submit the search, **Then** matching recipe results are returned and the experience does not require login.
3. **Given** a reviewer attempts to access a database service directly from the public internet, **When** the connection is attempted, **Then** the service is unreachable.

---

### User Story 3 - Remove the Demo (Priority: P3)

After a demonstration, the operator wants to remove the temporary environment with one documented action and verify that no demo-created cloud resources remain.

**Why this priority**: Reliable teardown limits cost and prevents forgotten public infrastructure.

**Independent Test**: Launch the environment, run the documented teardown action, then inspect the cloud account for resources created by the demo.

**Acceptance Scenarios**:

1. **Given** the demo environment is tracked by its deployment state, **When** the operator runs the teardown action, **Then** all cloud resources created for the demo are removed and the command reports completion.
2. **Given** the deployment state is unavailable or teardown fails, **When** the operator follows the destroy checklist, **Then** it identifies the remaining resources and provides steps to remove them manually.
3. **Given** teardown has completed, **When** the operator checks the public address and cloud resource inventory, **Then** the demo is no longer reachable and no demo-created resources remain.

### Edge Cases

- The operator's allowed SSH source address has changed or is not provided; launch must stop before creating the public server and explain the missing or invalid prerequisite.
- The application image cannot be retrieved or the recipe data import fails; launch must not report readiness and must provide an actionable failure status.
- Certificate issuance is delayed or unavailable; the deployment must not claim secure-demo readiness until HTTPS works, and must explain the failure.
- The deployment is interrupted after some resources are created; the operator must be able to resume or remove those resources using the recorded deployment state and destroy checklist.
- The operator's spending estimate exceeds the configured budget limit; launch must stop before creating the public server.
- Teardown partially fails or the local deployment state is lost; the checklist must support identifying and removing any remaining demo-created resources.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: An operator MUST be able to launch the demo with one documented action after providing the documented cloud access, SSH key, allowed SSH source address, and prepared recipe data.
- **FR-002**: The launch process MUST provision a temporary demo environment and provide its public address only after the application is available and the recipe data has been imported successfully.
- **FR-003**: The application MUST be reachable by reviewers over HTTPS with a browser-trusted certificate, without requiring the operator to own a domain name.
- **FR-004**: The public demo MUST support the existing recipe search experience without requiring reviewer accounts or login.
- **FR-005**: Public network access MUST be limited to web traffic; administrative SSH access MUST be restricted to the operator-provided source address, and database services MUST NOT be publicly reachable.
- **FR-006**: The deployment MUST generate and protect the database password, and MUST NOT place secrets in version-controlled files or published application images.
- **FR-007**: The launch process MUST transfer the operator's prepared recipe data through a protected administrative connection, import it into the demo, and MUST NOT require cloud object storage.
- **FR-008**: An automated build-and-publication workflow MUST publish application images for the selected source revision without requiring cloud-account credentials in that workflow.
- **FR-009**: Before a public demo server is created, the operator MUST be shown the estimated cost and a cost alert MUST be configured at the agreed threshold.
- **FR-010**: An operator MUST be able to remove the temporary demo with one documented teardown action that removes every cloud resource created for it, including network, address, access-key, and budget-alert resources.
- **FR-011**: The deployment MUST retain the local state needed to remove resources until teardown has succeeded and MUST provide a destroy checklist for recovery when state is unavailable or teardown is incomplete.
- **FR-012**: Launch, readiness, and teardown failures MUST be reported explicitly; a failed or incomplete operation MUST NOT be reported as successful.

### Key Entities

- **Demo Environment**: A temporary public application environment and the cloud resources created to run it.
- **Deployment State**: The local record of resources belonging to one demo environment, used to update or remove them.
- **Prepared Recipe Data**: The local, generated recipe files transferred to the demo for import and application use.
- **Application Image**: A published build of the application selected for a demo deployment.
- **Destroy Checklist**: Recovery instructions for verifying and removing demo-created resources if normal teardown cannot finish.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From a clean checkout with prerequisites satisfied, an operator can launch a working demo and receive its public address within 20 minutes.
- **SC-002**: In a demonstration verification run, 100% of checks confirm the public address uses a valid HTTPS certificate, the application loads, and a representative recipe search returns results.
- **SC-003**: In 100% of teardown verification runs, the teardown action removes all demo-created cloud resources; when it cannot, the destroy checklist enables the operator to identify and remove each remaining resource.
- **SC-004**: The estimated cost shown before launch is no greater than the configured per-demo limit; the default limit is US$5 per demonstration, with a cost alert configured before the public server is created.
- **SC-005**: Reviewers can complete a representative recipe search without an account, and no database service is reachable from the public internet.

## Assumptions

- The operator has an AWS account with permissions to create and remove the demo resources, local cloud credentials, a usable SSH key pair, and an up-to-date public source address for SSH access.
- Prepared recipe data is available locally and is not committed to the repository.
- Application images are publicly retrievable by the demo server and contain no secrets.
- The default spending limit is US$5 per demonstration; the operator may choose a lower limit. Actual charges depend on provider pricing and how long resources remain active.
- The demo is a single small server for temporary review, not a production service; it has no user accounts, autoscaling, or production availability guarantee.
- The deployment uses a temporary HTTPS hostname and automatic certificate issuance; a certificate authority's rate limits or availability can delay launch.
