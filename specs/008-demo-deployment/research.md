# Research: Demo Deployment

**Date**: 2026-11-04

This research resolves the deployment choices from the feature spec and product brief. The existing app uses Docker Compose, Neo4j, an Express API, static web assets, and Caddy. The current checked-in workflow references separate shared/demo stacks and OIDC, but the selected R3 requirements explicitly call for one operator-run stack and no cloud credentials in CI.

## AWS Network Exposure and Elastic IP

**Decision**: Use one dedicated security group with TCP 80/443 open to the public and SSH limited to the operator's current public address. Do not allow direct Neo4j or API ingress. Allocate an Elastic IP, use it for the public hostname and release it during teardown.

**Rationale**: This admits the reviewer-facing web application while limiting administration and keeping the graph private. A stable address simplifies SSH access, readiness checks, and the `sslip.io` hostname. Public IPv4 addresses can incur charges, including when idle, so the address must be included in the estimate and verified as released after destroy.

**Alternatives considered**: A managed access service could avoid inbound SSH but adds setup beyond this temporary demo. A changing instance address avoids allocating an Elastic IP but complicates a stable hostname and recovery.

**Sources**:
- [AWS security group rules for common use cases](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/security-group-rules-reference.html)
- [AWS security group rule basics](https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules.html)
- [AWS Elastic IP addresses](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/elastic-ip-addresses-eip.html)

## Dedicated VPC and Public Routing

**Decision**: Create a dedicated VPC, one public subnet, an Internet Gateway, and a public route table in the same Terraform state as the demo instance. Do not rely on an account default VPC and do not create a NAT gateway.

**Rationale**: The selected AWS region has no VPCs or subnets. Owning the minimal network in this stack makes launch reproducible and ensures teardown can remove the network without changing unrelated account resources. The subnet and routing are public for the demo host; its security group remains the ingress boundary, and only the demo stack is placed in this VPC.

**Alternatives considered**: Creating or restoring an account default VPC outside Terraform would leave persistent, untracked resources after demo teardown. Requiring the operator to create a VPC manually would add setup steps and ambiguous resource ownership. A NAT gateway adds cost and is unnecessary for a single public host.

## Terraform State and Secrets

**Decision**: Keep a single local Terraform state for this single-operator deployment. Ignore Terraform state and backup files, plans, provider working data, and local variable files in Git. Restrict local file access, and retain state until resource teardown has been verified.

**Rationale**: Local state is simple for a one-off demo without creating a shared backend that would itself require persistent cloud resources. State and plan files may contain secrets in plaintext; they are sensitive operational data, not disposable build artifacts. Do not transfer them to the instance or publish them.

The generated database password is also not placed in EC2 user data, which can be retrieved through AWS APIs. After provisioning, the operator transfers it over verified SSH into the server's owner-readable environment file. Terraform state remains sensitive and is access-restricted locally.

**Alternatives considered**: A remote backend supports collaboration and locking across operators but adds persistent shared infrastructure and is outside this feature's one-stack/clean-teardown boundary. Local state is unsuitable for concurrent operators.

**Sources**:
- [Terraform local backend](https://developer.hashicorp.com/terraform/language/backend/local)
- [Terraform: managing sensitive data](https://developer.hashicorp.com/terraform/language/manage-sensitive-data)

## Cost Estimate and Budget Alert

**Decision**: Require a current AWS Pricing Calculator estimate for the chosen region, instance, storage, and expected demo duration. Show the estimate and configured spending ceiling during launch preflight, and require explicit operator confirmation before apply. Create a budget alert before the public server. Document that the alert is not a spending cap and may arrive after usage has accrued.

**Rationale**: AWS budgets notify but do not synchronously prevent resources from being created or charges from accruing. Billing data and notifications can lag. A current, operator-reviewed estimate is more honest than implying a budget alarm or an outdated hard-coded price guarantees a cap. Use the spec's US$5 default ceiling unless the operator chooses a lower limit.

**Alternatives considered**: A hard-coded price estimate can become stale as region pricing changes. Budget actions add operational complexity and still do not provide an immediate, guaranteed charge limit.

**Sources**:
- [AWS Pricing Calculator](https://calculator.aws/)
- [AWS Budgets: managing costs](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html)
- [AWS Budgets best practices](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-best-practices.html)

## Prepared Data Transfer

**Decision**: Copy only the prepared CSV inputs from the operator machine to the server over SSH, verify SSH host identity, import with the existing Compose importer, and do not transfer local Terraform state or private keys.

**Rationale**: This preserves the local-only data workflow and avoids a persistent object-storage resource. SSH encrypts and authenticates the transfer; host verification prevents silently connecting to an unexpected server.

**Alternatives considered**: An object-storage bucket makes data delivery easier for automation but creates a separately managed resource, expands IAM requirements, and conflicts with the no-cloud-storage requirement. Image pulls can use GHCR, but prepared data must still be transferred to the instance.

**Source**:
- [OpenBSD scp manual](https://man.openbsd.org/scp.1)

## GitHub Actions and Public GHCR Images

**Decision**: The image publication job uses `GITHUB_TOKEN` with only `contents: read` and `packages: write`, and publishes public packages so the demo host can pull anonymously. The workflow receives no AWS credentials or cloud deployment permissions. Pin third-party actions to immutable commit SHAs.

**Rationale**: Image publication does not require provisioning infrastructure. Separating it from deployment narrows CI authority and supports an operator-run, locally stateful Terraform lifecycle. Public packages are required for unauthenticated pulls.

**Alternatives considered**: Private packages require an additional authenticated pull credential on the server. An OIDC role and Terraform deployment workflow give CI cloud authority and conflict with this release's no-OIDC, local-state decision.

**Sources**:
- [GitHub: publishing Docker images](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images)
- [GitHub: package permissions and visibility](https://docs.github.com/en/packages/learn-github-packages/about-permissions-for-github-packages)
- [GitHub: secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)

## Automatic HTTPS with `sslip.io`

**Decision**: Convert the allocated IPv4 address to the corresponding hyphenated `sslip.io` hostname and configure Caddy for automatic HTTPS. Preserve Caddy's certificate data for the lifetime of the running server and do not report readiness until public HTTPS succeeds.

**Rationale**: Publicly trusted automatic certificates require a DNS name that resolves to the server and reachable validation ports; a literal IP address is not a reliable public-certificate name. `sslip.io` resolves names containing the server's IP and avoids requiring a purchased domain for this demo.

**Alternatives considered**: A user-owned domain is more durable and avoids dependence on a third-party DNS service but is not a prerequisite for the demo. Serving only HTTP fails the secure-review requirement.

**Sources**:
- [sslip.io](https://sslip.io/)
- [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https)

## Repository-Specific Decision

**Decision**: Follow the feature spec and R3 requirements: one EC2 stack, local state, no S3, no OIDC role, no instance profile, and operator-driven apply/destroy. Replace the existing workflow's shared-stack deployment behavior with image publication only and reconcile the architecture documentation.

**Rationale**: The checked-in architecture/workflow describe infrastructure absent from the repository and contradict the scoped product requirements. Keeping them would create ambiguous ownership, require cloud credentials in CI, and prevent a single-state teardown.

**Alternatives considered**: Keeping the shared S3/OIDC design would simplify automated image-data delivery but would leave shared resources outside the requested demo destroy lifecycle.
