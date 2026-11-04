# Demo Destroy Checklist

Use this checklist only if `scripts/demo-down.sh` cannot complete or Terraform's local state is unavailable. Operate in the AWS account and region configured for the demo. Do not delete resources based only on a generic name; verify the exact stack prefix, project tags, IDs, and creation time first.

## Before Cleanup

- [ ] Stop any retry of `scripts/demo-up.sh` and retain all surviving Terraform state, backups, logs, and the local `.env.demo`.
- [ ] Verify the AWS account and region with `aws sts get-caller-identity` and the configured demo region.
- [ ] Review the Terraform state and outputs if available; record exact instance ID, VPC ID, security group ID, Elastic IP allocation ID, key-pair name, and budget name.
- [ ] If state is missing, list only resources tagged `Project=recipe-finder-demo` and named with the configured stack prefix. Confirm each candidate belongs to this demo before removal.

## Recover with Terraform State

When state is present and readable, use the normal destroy command first:

```sh
./scripts/demo-down.sh
```

If Terraform destroy partially failed, retain state and rerun after resolving the reported AWS error. Do not remove the state file to force a clean destroy. If an individual resource is already gone, inspect the exact state address and AWS resource ID before considering a narrowly scoped `terraform state rm`.

## Manually Remove Remaining Resources

Use the exact identifiers collected above. If state was lost, identify resources from the exact prefix/tags in the configured region; do not paste unverified IDs into destructive commands.

1. Terminate only the demo EC2 instance:

   ```sh
   aws ec2 terminate-instances --instance-ids <verified-demo-instance-id> --region <demo-region>
   ```

2. Release only the demo Elastic IP allocation:

   ```sh
   aws ec2 release-address --allocation-id <verified-demo-allocation-id> --region <demo-region>
   ```

3. Delete the demo security group after the instance is terminated and its network interfaces are detached:

   ```sh
   aws ec2 delete-security-group --group-id <verified-demo-security-group-id> --region <demo-region>
   ```

4. Delete the EC2 key-pair resource (this does not delete the operator's local key files):

   ```sh
   aws ec2 delete-key-pair --key-name <verified-demo-key-name> --region <demo-region>
   ```

5. Delete only the demo account-level budget:

   ```sh
   aws budgets delete-budget --account-id <verified-account-id> --budget-name <verified-demo-budget-name>
   ```

6. If Terraform state is unavailable, remove the verified demo network only after the EC2 instance and its network interfaces are gone. Delete the subnet and route table association, route table, internet gateway (detach it first), and VPC, using only IDs confirmed to belong to this demo. For example:

   ```sh
   aws ec2 disassociate-route-table --association-id <verified-demo-route-association-id> --region <demo-region>
   aws ec2 delete-subnet --subnet-id <verified-demo-subnet-id> --region <demo-region>
   aws ec2 delete-route-table --route-table-id <verified-demo-route-table-id> --region <demo-region>
   aws ec2 detach-internet-gateway --internet-gateway-id <verified-demo-igw-id> --vpc-id <verified-demo-vpc-id> --region <demo-region>
   aws ec2 delete-internet-gateway --internet-gateway-id <verified-demo-igw-id> --region <demo-region>
   aws ec2 delete-vpc --vpc-id <verified-demo-vpc-id> --region <demo-region>
   ```

7. Confirm the demo public IPv4 and dedicated VPC are removed and no demo instance remains active:

   ```sh
   aws ec2 describe-addresses --region <demo-region>
   aws ec2 describe-instances --region <demo-region> --filters Name=tag:Project,Values=recipe-finder-demo
   aws ec2 describe-security-groups --region <demo-region> --filters Name=tag:Project,Values=recipe-finder-demo
   aws ec2 describe-vpcs --region <demo-region> --filters Name=tag:Project,Values=recipe-finder-demo
   aws ec2 describe-key-pairs --region <demo-region>
   aws budgets describe-budgets --account-id <verified-account-id>
   ```

AWS APIs may be eventually consistent. Repeat read-only checks after a delay and distinguish terminated instances from active instances. A key-pair listing includes unrelated keys, and budget listings include unrelated account budgets; verify exact names rather than deleting by list position.

## Completion

- [ ] No active instance, dedicated demo VPC, demo security group, or demo Elastic IP remains.
- [ ] The exact demo key-pair resource and budget are absent.
- [ ] The public demo URL no longer resolves to a running app.
- [ ] Terraform state is retained until all checks pass; then store or remove local sensitive state according to the operator's retention policy.
- [ ] Record the remaining-resource IDs and cleanup actions in the review record without recording secrets.
