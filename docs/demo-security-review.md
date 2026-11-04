# Demo Deployment Security Review

Complete and record this review before the first public deployment. The launch command refuses to provision resources while any review item is unchecked. Review the current code and configuration, not just this checklist.

- [x] Confirm the security group allows only TCP 80/443 from the internet and TCP 22 from the operator's current public `/32`; verify there are no database or direct API ingress rules.
- [x] Confirm Terraform state, plans, credentials, generated environment files, SSH private keys, and prepared data are excluded from Git and Docker build contexts; confirm the database password is absent from EC2 user data and published images.
- [x] Confirm the operator SSH key is private and protected, the server host key is verified against the AWS-authenticated instance console output, and SSH host-key checking is not disabled.
- [x] Confirm the image workflow uses only `GITHUB_TOKEN` package-publish permissions and has no AWS credentials, OIDC role, or deployment permissions.
- [x] Confirm the current estimate includes the instance, storage, public IPv4 address, and expected run time; verify the budget notification destination and understand it is not a hard spending cap.
- [x] Confirm prepared CSVs are transferred only over verified SSH, no object storage is created, and no contributor identities are deployed.
- [x] Confirm the single local Terraform state is access-restricted and retained until teardown verification; review the resource inventory and destroy checklist.

**Reviewer**: Operator (confirmed in chat)

**Review date**: 2026-11-04

**Approval to provision billable AWS resources**: Granted by operator; demo launched on 2026-11-04. The operator-approved instance type is `c7i-flex.large`; the AWS budget is advisory, not a spending cap.
