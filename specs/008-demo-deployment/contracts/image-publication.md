# Application Image Publication Contract

## Workflow

- The deployment workflow builds the application containers required by the production Compose services (importer, API, and web); the Caddy base image remains the pinned upstream image declared by the deployment configuration.
- Images are associated with the triggering source revision and published to public GHCR packages.
- The workflow uses `GITHUB_TOKEN` with `contents: read` and `packages: write` only for the publishing job.
- Third-party GitHub Actions are pinned to immutable commit SHAs.
- The workflow does not assume AWS roles, use AWS credentials, provision infrastructure, or transfer prepared data.

## Image Consumption

- The demo server pulls public images anonymously.
- The deployed image set corresponds to a source revision selected by the operator; tags must not silently resolve to an unrelated revision during one launch.
- Published images contain no prepared data, credentials, `.env` files, Terraform state, or SSH keys.
- Compose keeps the existing app health and importer-success dependencies so the API does not become ready before data import.

## Verification

- Verify the workflow has no AWS permissions or credential configuration.
- Verify public package visibility and anonymous pulls.
- Verify published image tags/digests identify the triggering revision and all required services.
