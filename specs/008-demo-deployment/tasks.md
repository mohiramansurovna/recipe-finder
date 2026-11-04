# Tasks: Demo Deployment

**Input**: Design documents from `specs/008-demo-deployment/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, and `quickstart.md`

**Tests**: Focused deployment checks are included because the implementation plan and project constitution require verifiable configuration and operational contracts.

**Organization**: Tasks are grouped by user story. The single-operator local Terraform state and one demo environment require live stories to be validated sequentially.

## Phase 1: Setup

**Purpose**: Establish safe local configuration and prerequisites without provisioning AWS resources.

- [X] T001 [P] Ignore Terraform state, state backups, plans, provider data, local variables, and `.env.demo` in `.gitignore`.
- [X] T002 [P] Create `.env.demo.example` documenting the region, SSH public-key path, operator SSH CIDR, prepared-data path, image revision, cost estimate/limit, and budget notification inputs without including credentials.
- [X] T003 [P] Create `docs/demo-security-review.md` with a pre-deployment review gate covering public ingress, SSH scope, secret handling, state protection, image provenance, data transfer, and teardown ownership.

## Phase 2: Foundational

**Purpose**: Protect the existing local environment and align shared documentation before deployment-specific work.

- [X] T004 Update `docs/architecture.md` to replace the absent shared S3/OIDC and split Terraform deployment description with the planned single-stack, local-state, SSH-transfer model.
- [X] T005 [P] Add `tests/deployment/local-compose.test.ts` to assert local Compose keeps Neo4j and the web entry point bound to loopback and does not expose API or Neo4j ports publicly.

**Checkpoint**: Local development boundaries and the mandatory public-deployment security gate are documented before any cloud provisioning work.

## Phase 3: User Story 1 - Launch a Demo (Priority: P1) 🎯 MVP

**Goal**: Let an operator launch the current app and imported prepared recipe data with one command, using an image set from the selected revision, and report readiness only when HTTPS and the application are ready.

**Independent Test**: With AWS prerequisites, prepared data, and published images available, launch the demo and confirm the command reports its HTTPS URL only after successful import and application readiness. Confirm an over-limit estimate or missing budget setup blocks server creation.

### Implementation for User Story 1

- [X] T006 [P] [US1] Pin the Terraform and AWS/random provider requirements in `infra/terraform/versions.tf`.
- [X] T007 [P] [US1] Define validated region, SSH CIDR, public key, cost estimate/limit, notification, and instance inputs in `infra/terraform/variables.tf`.
- [X] T008 [US1] Create the single-stack dedicated VPC, public subnet and internet route, EC2, security group, Elastic IP and association, key-pair resource, generated database credential, and budget alert in `infra/terraform/main.tf`; permit only TCP 80/443 publicly and TCP 22 from the configured operator CIDR, and make EC2 creation depend on the budget alert and public route.
- [X] T009 [US1] Create `infra/terraform/user-data.sh.tftpl` to install Docker/Compose and prepare the server without placing the database password or other secrets in user data.
- [X] T010 [US1] Create `docker-compose.demo.yml` to pull the revision-selected public GHCR images, transfer/import local prepared CSVs, keep API and Neo4j private to the Compose network, and leave existing local Compose behavior unchanged.
- [X] T011 [P] [US1] Create `Caddyfile.demo` to serve the app and proxy `/api` over automatic HTTPS using the allocated-IP `sslip.io` hostname, while preserving the local HTTP Caddy configuration.
- [X] T012 [US1] Create `.github/workflows/demo-deployment.yml` to build and publish importer, API, and web images for the triggering revision to public GHCR, using only `GITHUB_TOKEN` with `contents: read` and `packages: write`, immutable action pins, and no AWS permissions.
- [X] T013 [US1] Implement prerequisite validation, estimate/limit display, explicit confirmation, safe Terraform initialization/plan/apply, and actionable failure reporting in `scripts/demo-up.sh`; reject a missing or broad SSH CIDR and stop before creating the server if the cost or budget gate fails.
- [X] T014 [US1] Extend `scripts/demo-up.sh` to verify SSH host identity, transfer only prepared CSVs, deliver the generated database password over verified SSH into an owner-readable environment file, and run the remote Compose importer without placing secrets in logs or source-controlled files.
- [X] T015 [US1] Extend `scripts/demo-up.sh` to start the application and wait for successful import, API health, and valid public HTTPS before printing the URL; on any failure return nonzero and retain state for recovery.
- [X] T016 [US1] Add `tests/deployment/terraform.test.ts` and `tests/deployment/demo-up.test.ts` to check Terraform formatting/validation and assert the launch contract rejects unsafe or missing inputs, does not suppress SSH host verification, and never reports success after a failed stage.
- [X] T017 [US1] Create `docs/demo-deployment.md` with operator prerequisites, ignored local configuration, image selection, cost estimate and budget-alert limitations, launch behavior, and links to the deployment and security contracts.
- [X] T018 [US1] After completing and recording the review in `docs/demo-security-review.md`, obtain explicit operator approval, then run `scripts/demo-up.sh` and record whether the launch/import/HTTPS readiness acceptance test passes; do not provision resources before the review and approval.

**Checkpoint**: The operator can launch a working demo and receives a URL only after imported-data and HTTPS readiness checks pass.

## Phase 4: User Story 2 - Review the Live Application (Priority: P2)

**Goal**: Let reviewers use the existing recipe search over trusted HTTPS without an account, while ensuring the database and API remain inaccessible directly from the public internet.

**Independent Test**: Against the launched demo, open the URL in a clean browser, verify a valid HTTPS certificate, submit a representative ingredient search without login, and confirm direct connections to API and Neo4j ports are refused.

**Dependencies**: Requires the live environment from User Story 1. Validate this story before teardown; the single local deployment state does not support parallel live demos.

### Implementation for User Story 2

- [X] T019 [P] [US2] Create `scripts/demo-smoke.sh` to accept the public HTTPS URL, verify certificate-valid HTTPS and app availability, submit a representative unauthenticated recipe search, and fail if the expected result contract is not met.
- [X] T020 [P] [US2] Add `tests/deployment/demo-smoke.test.ts` to verify the smoke check reports success only for valid HTTPS and a successful recipe-search response and reports failures explicitly.
- [X] T021 [US2] Update `docs/demo-deployment.md` with the reviewer URL and browser/search verification steps, and record the manual ingress check confirming that only ports 80/443 are public and SSH is restricted to the configured source CIDR.

**Checkpoint**: Reviewers can complete a representative search over HTTPS without login, and neither the API nor database is directly public.

## Phase 5: User Story 3 - Remove the Demo (Priority: P3)

**Goal**: Remove all resources created for the demo with one command and guide the operator through recovery if state is unavailable or destruction is incomplete.

**Independent Test**: After reviewer validation, run the teardown command and verify the URL is unavailable and all stack-owned AWS resources, including the Elastic IP and budget alert, are gone. Exercise the checklist for a simulated missing-state or partial-destroy scenario without deleting unrelated resources.

**Dependencies**: Requires the User Story 1 deployment. Run after User Story 2 validation, because teardown removes the environment being reviewed.

### Implementation for User Story 3

- [X] T022 [P] [US3] Add `tests/deployment/demo-down.test.ts` for successful destroy verification, partial-destroy failure, missing-state recovery messaging, and retention of state while resources may remain.
- [X] T023 [US3] Implement `scripts/demo-down.sh` to require the correct local state, run Terraform destroy, verify the instance, dedicated VPC, security group, Elastic IP/association, key-pair resource, and budget alert are removed, return nonzero on any failure, and retain state until verification succeeds.
- [X] T024 [US3] Create `docs/demo-destroy-checklist.md` with stack-owned resource inventory, Terraform-state recovery guidance, scoped AWS CLI/console discovery steps, manual removal instructions, and a final no-resources verification step.
- [ ] T025 [US3] After User Story 2 verification, run `scripts/demo-down.sh` and record whether the URL is unavailable and all demo-created resources are removed; if teardown or verification fails, preserve state and follow `docs/demo-destroy-checklist.md`.

**Checkpoint**: The normal one-command teardown removes all demo resources, and recovery instructions cover partial failure or lost local state.

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verify documentation, security boundaries, and the complete deployment runbook without broadening the release scope.

- [X] T026 Update `README.md` with links to `docs/demo-deployment.md` and `docs/demo-destroy-checklist.md`, keeping local startup instructions and loopback defaults intact.
- [X] T027 Run `npm run check`, `docker compose config`, `bash -n scripts/demo-up.sh scripts/demo-down.sh scripts/demo-smoke.sh`, Terraform format/validation, deployment tests, and the non-provisioning sections of `specs/008-demo-deployment/quickstart.md`; resolve failures before declaring the feature complete.

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; can start immediately.
- **Foundational (Phase 2)**: Depends on Setup; establishes local safety and shared documentation.
- **User Story 1 (Phase 3)**: Depends on Setup and Foundational; creates and launches the demo.
- **User Story 2 (Phase 4)**: Depends on a ready User Story 1 deployment.
- **User Story 3 (Phase 5)**: Depends on User Story 1 and follows User Story 2 validation; it destroys the single shared demo environment.
- **Polish (Phase 6)**: Depends on implementation and the intended live acceptance checks.

### User Story Dependencies

- **User Story 1 (P1)**: Independent after Foundational; produces the first usable demo.
- **User Story 2 (P2)**: Requires the ready URL produced by User Story 1; cannot be validated before launch.
- **User Story 3 (P3)**: Requires a User Story 1 environment and runs after User Story 2 when both are validating the same single-operator stack.

### Parallel Opportunities

- Setup tasks **T001–T003** touch separate files and can proceed in parallel.
- Foundational **T004–T005** touch documentation and tests separately and can proceed in parallel after Setup.
- In User Story 1, **T006–T007** edit independent Terraform files; **T011** can be prepared independently of the Terraform module; the GHCR workflow **T012** is independent of Caddy configuration once image names are agreed.
- In User Story 2, **T019–T020** use separate files and can be implemented in parallel; the live acceptance run **T021** follows both.
- In User Story 3, **T022** and **T024** are independent test and documentation work; run them alongside implementation only if the interfaces and resource inventory are held to the contracts.
- The three live user-story validations are sequential because they share one local Terraform state and one environment; do not launch concurrent stacks to parallelize them.

## Parallel Examples

### Setup and Foundation

```text
T001 .gitignore
T002 .env.demo.example
T003 docs/demo-security-review.md

After Setup:
T004 docs/architecture.md
T005 tests/deployment/local-compose.test.ts
```

### User Story 1

```text
In parallel:
T006 infra/versions.tf
T007 infra/variables.tf
T011 Caddyfile.demo

Then sequence the stack, workflow, and operator launch:
T008 infra/main.tf
T009 infra/user-data.sh.tftpl
T010 docker-compose.demo.yml
T012 .github/workflows/demo-deployment.yml
T013-T015 scripts/demo-up.sh
T016-T018 tests, documentation, and approved live validation
```

### User Story 2 and User Story 3

```text
User Story 2, while the User Story 1 demo is ready:
T019 scripts/demo-smoke.sh
T020 tests/deployment/demo-smoke.test.ts
Then T021 live browser and ingress verification.

After User Story 2:
T022 tests/deployment/demo-down.test.ts
T023 scripts/demo-down.sh
T024 docs/demo-destroy-checklist.md
Then T025 live teardown and resource verification.
```

## Implementation Strategy

### MVP First (User Story 1)

1. Complete Setup and Foundational phases.
2. Build the single-stack Terraform configuration, demo Compose/Caddy setup, and GHCR image publication.
3. Implement and statically validate `scripts/demo-up.sh`.
4. Complete and record the security review; obtain explicit operator approval before the first billable apply.
5. Launch, import prepared data, and validate HTTPS/readiness. Stop if any security, cost, or readiness gate fails.

### Incremental Delivery

1. Deliver User Story 1 as the first working demo, including its initial secure deployment gate.
2. Validate User Story 2 against that live demo before removing it.
3. Deliver User Story 3 and verify all stack resources are removed.
4. Complete the cross-cutting checks and update the README.

### Independent Test Criteria

- **US1**: `scripts/demo-up.sh` reports a reachable HTTPS URL only after successful CSV transfer, import, and application readiness; invalid cost/security prerequisites block provisioning.
- **US2**: `scripts/demo-smoke.sh` validates a browser-trusted HTTPS endpoint and a representative unauthenticated recipe-search response; manual ingress checks confirm API and database ports are unreachable.
- **US3**: `scripts/demo-down.sh` reports success only after scoped resource verification confirms removal; the destroy checklist supports manual recovery when state or destroy is unavailable.

## Notes

- `[P]` marks tasks that touch separate files and can proceed concurrently without waiting on incomplete work.
- `[US1]`, `[US2]`, and `[US3]` are represented by their respective phase headings; no user-story task is left outside a story phase.
- Live cloud provisioning and destruction are explicit operator actions; no task creates or removes AWS resources automatically without that approval.
