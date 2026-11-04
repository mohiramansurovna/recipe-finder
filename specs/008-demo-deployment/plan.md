# Implementation Plan: Demo Deployment

**Branch**: `008-demo-deployment` | **Date**: 2026-11-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/008-demo-deployment/spec.md`

## Summary

Provide a one-command, temporary AWS demo of the existing Recipe Finder. A single local-state Terraform stack provisions a dedicated VPC with a public subnet and internet route, an EC2 server, restricted security group, Elastic IP, operator key pair, and AWS budget alert. A local launch script transfers prepared CSVs over verified SSH, imports them, and waits for Caddy HTTPS and application readiness. GitHub Actions publishes public application images to GHCR using only the repository token. A separate local teardown command destroys the stack and verifies cleanup, with a checklist for recovery. No shared cloud storage, CI cloud credentials, database ingress, or production architecture is added.

The current [architecture.md](../../docs/architecture.md) and tracked `.github/workflows/demo-deployment.yml` refer to shared S3/OIDC and separate Terraform stacks that do not exist. This release replaces those deployment assumptions with the single-stack, operator-run model in the feature specification and [product requirements](../../docs/prd.md).

## Technical Context

**Language/Version**: Terraform 1.6.6 or newer (below 2.0); Bash on the operator's Linux/macOS shell; existing application images use Node.js 22.

**Primary Dependencies**: Terraform AWS and random providers; AWS CLI credentials for the operator; Docker Compose v2; SSH and rsync; GitHub Actions with `GITHUB_TOKEN`; public GHCR packages; Caddy 2 automatic HTTPS. No new application runtime dependencies.

**Storage**: Terraform local state on the operator's machine; generated recipe CSVs remain local until transferred over SSH; Neo4j data resides on the temporary server's attached root volume and is removed with the instance.

**Testing**: `npm run check`; Docker Compose configuration validation; shell syntax checks; Terraform format, initialization, validation, and plan; workflow static validation; manual AWS launch, HTTPS/search readiness, network exposure, and teardown verification. Cost-bearing integration validation is an explicit operator action.

**Target Platform**: A Terraform-managed, dedicated AWS VPC and one small Linux EC2 instance; the operator's local workstation; GitHub-hosted Linux runner for image publication.

**Project Type**: Existing web application plus infrastructure-as-code, operator scripts, and CI workflow.

**Performance Goals**: From prepared local data and satisfied prerequisites, the demo reports ready within 20 minutes; the existing search should meet its approximately one-second first-page target on demo hardware.

**Constraints**:
- Restrict internet ingress to TCP 80/443 and SSH from the operator-provided address; do not expose Neo4j or API container ports.
- Use one Terraform state and one stack. Keep state, plans, credentials, and generated environment files out of version control; local Terraform state and plans can contain sensitive values and must be access-restricted.
- The database password is generated for the deployment and kept out of source control and published images. Do not embed it in EC2 user data; transfer it to the server's environment file over verified SSH with restrictive file permissions.
- CI may publish images but has no AWS credentials or cloud-deployment permissions.
- CSV data is transferred directly from the operator to the server over verified SSH; no S3 or other cloud data store.
- Use the Elastic IP-derived `sslip.io` hostname for automatic HTTPS. Certificate issuance depends on public DNS and ports 80/443 being reachable.
- Obtain and show a current price estimate and require operator confirmation before provisioning. Configure the AWS budget alert before creating the public server; it is an alert, not a hard spending cap, and billing data can lag.
- One operator owns the local state; concurrent operators and shared state are out of scope.
- Create and destroy a dedicated public subnet and internet route in the same Terraform state; do not rely on an account default VPC or create a NAT gateway.
- **Open technical decisions**: None. Region, SSH CIDR, public key, data directory, and estimated-cost ceiling are operator configuration, not unresolved product decisions.

**Scale/Scope**: One temporary demo VPC/server stack and one operator at a time; no autoscaling, NAT gateway, load balancer, CDN, production availability, accounts, or persistent cloud data services.

## Constitution Check

### Pre-Design Gate

- **I. Data Integrity Before Convenience — PASS**: Deploy the already-generated prepared CSV contract unchanged; keep raw and prepared source data local and transfer it without adding a cloud copy.
- **II. Local-First, Privacy-Safe Operations — CONDITIONAL PASS**: Public web access is intentional for the demo, with only HTTPS/HTTP ingress and operator-restricted SSH; database ports remain private. Generated secrets and Terraform artifacts stay out of Git. The first public apply is blocked until the explicit security review and ingress/secret-handling checks are complete.
- **III. Test-First Delivery — PASS**: Add focused checks for scripts, Terraform, deployment configuration, and the existing app; use a manual end-to-end deployment only for the cloud-specific behavior.
- **IV. Contract-Driven Integration — PASS**: Preserve Compose, importer CSV, app HTTP, and container contracts; document the operator commands and image publication contract.
- **V. Release Discipline — PASS**: Limit scope to R3 demo deployment; do not introduce personalization, substitutions, or production hardening.

No unresolved design-gate violation is accepted. The explicit security review is a prerequisite to the first public deployment, not an optional follow-up.

## Project Structure

### Documentation (this feature)

```text
specs/008-demo-deployment/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── demo-commands.md
│   ├── image-publication.md
│   └── public-ingress.md
└── tasks.md
```

### Source Code (repository root)

```text
.github/
└── workflows/
    └── demo-deployment.yml      # Build and publish public images to GHCR only

infra/
└── terraform/                   # One AWS stack and local state
    └── user-data.sh.tftpl       # Host bootstrap without embedded secrets

scripts/
├── demo-up.sh                   # Preflight, apply, transfer, import, readiness
└── demo-down.sh                 # Destroy and verify resources are removed

docs/
├── architecture.md              # Reconcile deployment model with this release
├── demo-deployment.md           # Operator prerequisites and deployment guide
└── demo-destroy-checklist.md    # Manual cleanup and lost-state recovery

tests/
└── deployment/                  # Focused script/configuration verification

Caddyfile                        # HTTPS hostname configuration for the demo
docker-compose.yml               # Published images, environment and demo ports
.gitignore                       # Terraform state/plans and local deployment config
```

**Structure Decision**: Keep application code in the existing root/API/web layout. Place the single Terraform stack under `infra/terraform`, operator entry points alongside existing scripts, and deployment-specific checks in `tests/deployment`. Adapt the existing Compose and Caddy files for public demo operation without changing the loopback-only local defaults. Replace, rather than extend, the existing workflow's unsupported shared-stack/OIDC deployment behavior.

## Complexity Tracking

No constitution exceptions or additional architectural layers are planned.

## Phase 0: Research

See [research.md](./research.md) for the decisions, rationale, alternatives, and primary references. Research confirms the intended AWS ingress, local-state handling, cost-alert limitations, protected transfer, GHCR permissions, and `sslip.io` HTTPS constraints. It also confirms that no product clarification remains open.

## Phase 1: Design

- [Data model](./data-model.md): defines the temporary environment, local deployment state, prepared data, published images, budget alert, and their lifecycle constraints.
- [Contracts](./contracts/): specifies operator launch/teardown behavior, GHCR publication, and public/private network boundaries.
- [Quickstart](./quickstart.md): provides post-implementation validation for prerequisites, dry-run checks, launch, HTTPS/search readiness, and teardown.

### Post-Design Constitution Check

- **I. Data Integrity Before Convenience — PASS**: Prepared data remains the established input contract; the design adds no data transformation or persistent hosted copy.
- **II. Local-First, Privacy-Safe Operations — CONDITIONAL PASS**: Designed ingress excludes database/API ports, restricts SSH to the operator, and isolates secrets and state. A documented security review and a successful ingress/secrets check are mandatory before any public apply.
- **III. Test-First Delivery — PASS**: The quickstart and test plan cover low-cost static validation before the explicitly approved cloud integration run.
- **IV. Contract-Driven Integration — PASS**: Compose, app health/search, importer data, CLI, and image contracts are captured for validation.
- **V. Release Discipline — PASS**: Only the demo deployment slice is included; the existing private local-development defaults remain intact.

**Gate result**: Ready for task breakdown, with the security review retained as a mandatory first-deployment gate.
