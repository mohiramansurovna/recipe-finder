# Data Model: Demo Deployment

This feature adds no application-domain or Neo4j schema. These entities describe the deployment resources and local artifacts needed to create, operate, and remove one temporary demo.

## Demo Environment

Represents one provisioned public instance of the existing application.

**Fields**

- `deployment_id`: stable identifier for the Terraform-managed environment.
- `region`: AWS region selected by the operator.
- `public_ipv4`: allocated Elastic IP address.
- `public_hostname`: IP-derived `sslip.io` name used by Caddy and reviewers.
- `application_revision`: source revision whose images are used by the demo.
- `lifecycle_state`: `planned`, `provisioning`, `importing`, `ready`, `destroying`, `destroyed`, or `incomplete`.

**Relationships**

- Owns one EC2 instance, one Elastic IP association/address, one security group, one key-pair resource, and one budget alert.
- Uses the selected application image set and the transferred prepared-data set.
- Is represented by one local Terraform state.

**Validation and lifecycle rules**

- Only one active stateful demo deployment is supported per local working directory.
- `ready` is reported only after import completes and the public HTTPS address is reachable with a valid certificate.
- `destroyed` is reported only after Terraform destroy succeeds and a verification pass finds no owned AWS resources remaining.
- Interrupted provisioning or teardown remains `incomplete` until resumed or manually reconciled.
- SSH ingress is limited to the configured operator source address; public ingress permits only web traffic; database ports are never public.

## Deployment State

The local Terraform state, provider metadata, and configuration used to track demo-owned resources.

**Fields**

- `state_path`: local path to Terraform state.
- `configuration_path`: local stack path.
- `operator_inputs`: non-secret configuration including region, public key, SSH source CIDR, and cost estimate/ceiling.
- `sensitive_values`: generated database credential and any sensitive provider state.
- `last_known_state`: most recent lifecycle state and resource inventory.

**Relationships**

- Tracks the Demo Environment and all resources created for it.
- May include plaintext-sensitive data in state, backups, or plan files.

**Validation and lifecycle rules**

- State and plan files, provider data, and local variable files are excluded from version control.
- Local files are access-restricted; state and private credentials are never copied to the server.
- Do not embed the generated database credential in EC2 user data; deliver it to the server over verified SSH and write it to an owner-readable environment file.
- Keep state through successful teardown verification. Do not delete it while any owned resource may remain.
- State loss or partial destroy triggers the manual destroy checklist; it must not be reported as a clean teardown.

## Prepared Data Set

The generated graph CSV inputs used by the existing import process.

**Fields**

- `local_directory`: operator-selected prepared-data directory.
- `files`: required CSV file set expected by the existing importer.
- `transfer_status`: `not_started`, `transferring`, `transferred`, `imported`, or `failed`.

**Relationships**

- Produced locally by the existing data-preparation workflow.
- Transferred directly to the Demo Environment over SSH and consumed by the existing Compose importer.

**Validation and lifecycle rules**

- Raw data and generated prepared files remain local; they are not committed or uploaded to object storage.
- A failed transfer or import blocks readiness.
- The deployment never transfers Terraform state, SSH private keys, or contributor identities.

## Application Image Set

The published containers selected for a demo.

**Fields**

- `source_revision`: repository commit associated with the build.
- `package_names`: public GHCR names for application containers needed by Compose.
- `image_digests`: immutable image identifiers recorded or used for the selected release.
- `publication_state`: `building`, `published`, or `failed`.

**Relationships**

- Built and published by GitHub Actions using `GITHUB_TOKEN`.
- Pulled anonymously by the Demo Environment.

**Validation and lifecycle rules**

- The selected set must come from the intended source revision and contain no secrets.
- Public packages are required for anonymous instance pulls.
- The publication workflow has no AWS permissions.

## Budget Alert

An AWS budget associated with the temporary demo's expected cost threshold.

**Fields**

- `amount_usd`: agreed threshold, defaulting to US$5 per demonstration.
- `notification_targets`: operator-owned email notification destinations.
- `budget_period`: monthly AWS budget period.
- `alert_state`: `configured`, `notified`, or `unknown`.

**Relationships**

- Created before the public Demo Environment is provisioned.
- Owned by the same Terraform stack so teardown removes it.

**Validation and lifecycle rules**

- Launch preflight displays a current operator-reviewed estimate and requires confirmation that it is within the configured ceiling.
- The EC2 resource depends on successful budget-alert creation so no public server is created before the alert is configured.
- A budget alert is advisory and may be delayed; it is not a spending cap.
- The alert must not be shared with unrelated workloads and must be included in teardown verification.
