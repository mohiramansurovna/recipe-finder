# Temporary AWS Demo Deployment

The demo is a temporary, operator-managed AWS environment. One local Terraform state owns a dedicated VPC, public subnet and routing, security group, and small EC2 instance; GitHub Actions only publishes public GHCR images and has no AWS credentials.

## Prerequisites

- AWS CLI credentials for an account authorized to create and remove the resources.
- Terraform 1.6.6 or newer below 2.0, AWS CLI, Docker with Compose v2, SSH, rsync, Git, and Node.js 20+.
- A local SSH key pair and prepared recipe CSVs from [the data-preparation guide](data-preparation.md).
- The revision's application images published to public GHCR packages. After the first package publication, set each package's visibility to **Public** in GitHub package settings so the instance can pull without credentials.
- A current public IPv4 address for SSH, a current regional estimate for the instance, encrypted root volume, and public IPv4 usage, and an email destination for the account-level AWS budget alert.
- A completed [security review](demo-security-review.md) checked against the [public ingress contract](../specs/008-demo-deployment/contracts/public-ingress.md).

## Configure

Copy `.env.demo.example` to `.env.demo` and set each value:

- `DEMO_REGION`: AWS region.
- `DEMO_INSTANCE_TYPE`: EC2 instance type; defaults to `t3.medium`. Select a type allowed and available in your account and region, and include its price in your estimate.
- `DEMO_SSH_CIDR`: current operator public IPv4 address with `/32`.
- `DEMO_PUBLIC_KEY_PATH`: absolute path to the SSH public key; the matching private key must be locally readable.
- `DEMO_GHCR_OWNER`: lowercase GitHub owner whose public packages contain the app images.
- `PREPARED_DATA_DIR`: absolute path containing `recipes.csv`, `ingredients.csv`, `recipe_ingredients.csv`, `ingredient_aliases.csv`, `ingredient_categories.csv`, and `recipe_cuisines.csv`.
- `DEMO_IMAGE_TAG`: full 40-character commit SHA for the published images. The launch script checks that the image commit and local checkout have identical application image build inputs.
- `DEMO_ESTIMATED_COST_USD`: current estimated total cost for the planned run.
- `DEMO_BUDGET_LIMIT_USD`: positive monthly alert amount (US$5 by default).
- `DEMO_BUDGET_EMAIL`: operator notification address.

The file is ignored by Git and excluded from Docker build contexts. Terraform state and plan files are also ignored and may contain the generated database password; protect them and do not transfer them to the host. The budget is account-wide and advisory: AWS cost reporting and alerts can lag and are not a spending cap.

## Launch

Run local checks first:

```sh
npm run check
terraform -chdir=infra/terraform fmt -check -recursive
terraform -chdir=infra/terraform init -backend=false
terraform -chdir=infra/terraform validate
NEO4J_PASSWORD=validation-password DEMO_HOSTNAME=demo.example.test docker compose -f docker-compose.demo.yml --env-file .env.demo config
bash -n scripts/demo-up.sh scripts/demo-down.sh scripts/demo-smoke.sh
```

Then launch:

```sh
./scripts/demo-up.sh
```

The command refuses to proceed unless the security review is complete, required files and the current revision are valid, the SSH address is a public `/32`, and the estimate is within the configured budget limit. It displays the cost information and requires the operator to type `CREATE BILLABLE AWS RESOURCES` before applying the plan. Terraform creates a dedicated VPC, public subnet, Internet Gateway, and public route table, so deployment does not depend on a default VPC and teardown removes the network it owns. The AWS budget is created before the EC2 instance. The password is not embedded in user data; SSH host identity is checked against the host-key fingerprint printed to the AWS-authenticated instance console output before the script connects.

Prepared data and demo configuration are sent over verified SSH. Readiness is reported only after import completes, the API responds, and the public `sslip.io` hostname serves the app and API over a valid HTTPS certificate.

## Reviewer access

Demo URL: **https://44-198-33-69.sslip.io**

Open the URL in a browser and confirm the certificate is trusted. Search for
`chicken` without signing in and confirm recipe results appear. The deployment
smoke check also verified certificate-valid HTTPS and a successful unauthenticated
chicken search (231,636 matching recipes).

Ingress verification on 2026-11-04 confirmed the security group allows TCP 80
and 443 from `0.0.0.0/0`, and TCP 22 only from the operator's configured
`185.230.204.108/32`. External connection checks found ports 3000, 7473, 7474,
and 7687 unreachable.

To repeat the smoke test:

```sh
./scripts/demo-smoke.sh https://44-198-33-69.sslip.io
```

It makes an unauthenticated chicken recipe search and requires at least one result.

## Teardown

After reviewer validation, run:

```sh
./scripts/demo-down.sh
```

The command shows the exact Terraform-owned resource identifiers and requires typing `DESTROY RECIPE FINDER DEMO RESOURCES`. It reports success only after Terraform state is empty and AWS confirms the instance, dedicated VPC, security group, Elastic IP, key pair, and budget have been removed. Keep state until this verification succeeds. If state is missing or teardown is incomplete, follow [the destroy checklist](demo-destroy-checklist.md); do not remove resources outside the recorded stack inventory.
