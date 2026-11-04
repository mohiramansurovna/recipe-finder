# Demo Deployment Quickstart and Validation

This guide is the end-to-end acceptance run for the demo deployment. It intentionally provisions billable AWS resources only when the operator explicitly runs the launch command.

## Prerequisites

1. Use an AWS account and region in which the operator can create and destroy the stack resources. The stack creates its own VPC, public subnet, Internet Gateway, and route table; it does not require an account default VPC.
2. Install Terraform 1.6.6 or newer below 2.0, AWS CLI, Docker with Compose v2, SSH, and rsync.
3. Configure local AWS credentials and verify the selected identity:

   ```sh
   aws sts get-caller-identity
   ```

4. Create an SSH key pair if needed and configure the public key path and the operator's current public SSH source CIDR in the ignored local deployment configuration.
5. Acquire and prepare the recipe data using [the repository data-preparation guide](../../docs/data-preparation.md). Keep generated CSVs local.
6. Confirm the application images for the selected source revision have been published and are anonymously pullable from GHCR. The launch script requires the selected image commit to have the same application image build inputs as the local checkout.
7. Review current regional prices for the configured instance and storage, expected usage duration, and public IPv4 address. Configure an estimate within the selected limit (US$5 by default) and a budget-alert notification destination. The budget alert notifies; it does not cap or immediately stop charges.
8. Complete the documented explicit security review before the first public apply.

## Preflight Validation

Run local non-provisioning checks first:

```sh
npm run check
NEO4J_PASSWORD=validation-password docker compose config
NEO4J_PASSWORD=validation-password DEMO_HOSTNAME=demo.example.test docker compose --env-file .env.demo.example -f docker-compose.demo.yml config
bash -n scripts/demo-up.sh scripts/demo-down.sh
terraform -chdir=infra/terraform fmt -check -recursive
terraform -chdir=infra/terraform init -backend=false
terraform -chdir=infra/terraform validate
```

Expected: all checks pass without creating AWS resources. Confirm `.gitignore` excludes state, plans, provider data, local variables, and generated deployment environment files.

## Launch and Verify

The launch is a cost-bearing, explicit operator action:

```sh
./scripts/demo-up.sh
```

Expected:

- Preflight displays the chosen region, estimated cost, threshold, and the resources to be created, and requires confirmation.
- Terraform provisions the dedicated network, then creates the budget alert before the public EC2 server.
- Prepared CSVs transfer over verified SSH, the existing importer completes, and services become healthy.
- The command exits successfully only after the returned HTTPS URL has a valid certificate and the application is ready.

Open the reported URL in a clean browser session. Confirm the recipe search works without login. Verify that direct internet access to Neo4j ports 7474, 7687, and 7473 and API port 3000 is unavailable and that SSH is allowed only from the configured operator address.

## Teardown and Verify

After review, remove the demo:

```sh
./scripts/demo-down.sh
```

Expected: nonzero exit if destroy or resource verification fails; success only after all stack-owned resources, including the dedicated VPC, Elastic IP, and budget alert, are removed.

Confirm the URL no longer serves the demo and use the AWS console/CLI to verify that the stack's instance, security group, Elastic IP, key pair, and budget alert are absent. If the command cannot complete, keep local Terraform state and follow [the destroy checklist](../../docs/demo-destroy-checklist.md); do not report teardown complete while any resource remains.
