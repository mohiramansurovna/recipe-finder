# Demo Operator Command Contract

This contract describes the local operator interface. Names and exact flags are finalized during implementation; the one-command launch and teardown behavior is fixed by the feature requirements.

## Prerequisites

- AWS CLI credentials for an account authorized to create and remove the stack's resources.
- Terraform, Docker Compose v2, SSH, and rsync installed.
- A usable local SSH key pair and its public key path.
- Current operator public SSH source CIDR.
- Prepared recipe CSVs in a local directory.
- A current price estimate for the selected region, instance, storage, and expected run duration.
- A configured notification destination for the AWS budget alert.
- Required explicit security review completed before first public provisioning.

Operator configuration is stored locally in ignored configuration files or environment variables. AWS access keys, SSH private keys, generated database credentials, Terraform state, and plans are never committed.

## Launch: `scripts/demo-up.sh`

**Purpose**: Validate prerequisites, display the estimate and budget threshold, require operator confirmation, provision the stack, securely transfer prepared data, import data, start the services, and wait for public HTTPS readiness.

**Success behavior**:

- Exit status `0` only after the HTTPS hostname responds with a valid certificate and the application reports ready with imported data.
- Print the final public HTTPS URL and the source revision/image set used.
- Keep Terraform state locally available for later teardown.

**Failure behavior**:

- Nonzero status and actionable stage information for invalid configuration, exceeded/missing estimate, budget setup failure, Terraform failure, SSH/host verification failure, transfer/import failure, or HTTPS/readiness timeout.
- Never print a success URL or claim readiness after a partial operation.
- Do not suppress SSH host-key verification or continue after a failed transfer/import.
- Do not place the database password in EC2 user data; send it over verified SSH and write the server environment file with owner-only permissions.
- Preserve state when provisioning is partial so teardown/recovery remains possible.

## Teardown: `scripts/demo-down.sh`

**Purpose**: Destroy all resources tracked by the selected state, then verify removal of the instance, security group, Elastic IP/association, key pair, and budget alert.

**Success behavior**:

- Exit status `0` only after destroy and ownership-scoped verification both succeed.
- Report that the URL is no longer available and that no stack-owned resources remain.
- Preserve enough local state until this verification is complete.

**Failure behavior**:

- Nonzero status with remaining resource identifiers and a reference to `docs/demo-destroy-checklist.md`.
- Do not delete local state or report success if resources remain or verification fails.

## Readiness Contract

- Public hostname uses the allocated Elastic IP and `sslip.io`.
- Browser access is HTTPS with a valid, publicly trusted certificate.
- The app loads and the existing recipe search works without login.
- No Neo4j or API container port is reachable directly from the public internet.
