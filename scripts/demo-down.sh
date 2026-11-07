#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
temporary_dir=""

DEMO_ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
TF_DIR="$DEMO_ROOT_DIR/infra"
source "$DEMO_ROOT_DIR/scripts/demo-lib.sh"

fail() {
  demo_error "$*"
  printf 'If Terraform state is unavailable or destroy is incomplete, follow the temporary demo teardown guidance in README.md.\n' >&2
  exit 1
}

verify_removed() {
  local account_id="$1"
  local instance_id="$2"
  local security_group_id="$3"
  local allocation_id="$4"
  local key_name="$5"
  local budget_name="$6"
  local vpc_id="$7"
  local error_file="$8"
  local active_instances budget_names

  active_instances="$(aws ec2 describe-instances \
    --instance-ids "$instance_id" \
    --query 'Reservations[].Instances[?State.Name!=`terminated`].InstanceId' \
    --output text)" || return 1
  if [[ -n "$active_instances" && "$active_instances" != "None" ]]; then
    demo_error "EC2 instance remains active: $active_instances"
    return 1
  fi

  if aws ec2 describe-security-groups --group-ids "$security_group_id" >/dev/null 2>"$error_file"; then
    demo_error "security group remains: $security_group_id"
    return 1
  elif ! grep -q 'InvalidGroup.NotFound' "$error_file"; then
    cat "$error_file" >&2
    return 1
  fi

  if aws ec2 describe-addresses --allocation-ids "$allocation_id" >/dev/null 2>"$error_file"; then
    demo_error "Elastic IP allocation remains: $allocation_id"
    return 1
  elif ! grep -q 'InvalidAllocationID.NotFound' "$error_file"; then
    cat "$error_file" >&2
    return 1
  fi

  if aws ec2 describe-key-pairs --key-names "$key_name" >/dev/null 2>"$error_file"; then
    demo_error "EC2 key-pair resource remains: $key_name"
    return 1
  elif ! grep -q 'InvalidKeyPair.NotFound' "$error_file"; then
    cat "$error_file" >&2
    return 1
  fi

  if aws ec2 describe-vpcs --vpc-ids "$vpc_id" >/dev/null 2>"$error_file"; then
    demo_error "dedicated VPC remains: $vpc_id"
    return 1
  elif ! grep -q 'InvalidVpcID.NotFound' "$error_file"; then
    cat "$error_file" >&2
    return 1
  fi

  budget_names="$(aws budgets describe-budgets \
    --account-id "$account_id" \
    --query 'Budgets[].BudgetName' \
    --output text)" || return 1
  if tr '\t' '\n' <<< "$budget_names" | grep -Fxq "$budget_name"; then
    demo_error "AWS budget remains: $budget_name"
    return 1
  fi
}

main() {
  local state_file state_resources instance_id security_group_id allocation_id
  local key_name budget_name vpc_id account_id confirmation attempt

  demo_read_config || exit 1
  [[ -n "${DEMO_REGION:-}" ]] || fail "DEMO_REGION is required in .env.demo"
  [[ -n "${DEMO_SSH_CIDR:-}" ]] || fail "DEMO_SSH_CIDR is required in .env.demo"
  [[ -n "${DEMO_PUBLIC_KEY_PATH:-}" ]] || fail "DEMO_PUBLIC_KEY_PATH is required in .env.demo"
  [[ -n "${DEMO_BUDGET_EMAIL:-}" ]] || fail "DEMO_BUDGET_EMAIL is required in .env.demo"
  command -v terraform >/dev/null 2>&1 || fail "required command not found: terraform"
  command -v aws >/dev/null 2>&1 || fail "required command not found: aws"

  export TF_VAR_region="$DEMO_REGION"
  export TF_VAR_ssh_allowed_cidr="$DEMO_SSH_CIDR"
  export TF_VAR_public_key_path="$DEMO_PUBLIC_KEY_PATH"
  export TF_VAR_budget_notification_email="$DEMO_BUDGET_EMAIL"
  export TF_VAR_budget_limit_usd="${DEMO_BUDGET_LIMIT_USD:-5}"
  export AWS_REGION="$DEMO_REGION"
  export AWS_DEFAULT_REGION="$DEMO_REGION"

  state_file="$TF_DIR/terraform.tfstate"
  [[ -s "$state_file" ]] || fail "local Terraform state is missing; do not guess resource IDs"
  terraform -chdir="$TF_DIR" init
  state_resources="$(terraform -chdir="$TF_DIR" state list)" ||
    fail "could not read Terraform state"
  [[ -n "$state_resources" ]] || fail "Terraform state has no tracked resources; verify AWS resources manually"

  instance_id="$(terraform -chdir="$TF_DIR" output -raw instance_id)" ||
    fail "instance identifier is unavailable from Terraform state"
  security_group_id="$(terraform -chdir="$TF_DIR" output -raw security_group_id)" ||
    fail "security group identifier is unavailable from Terraform state"
  allocation_id="$(terraform -chdir="$TF_DIR" output -raw elastic_ip_allocation_id)" ||
    fail "Elastic IP allocation identifier is unavailable from Terraform state"
  key_name="$(terraform -chdir="$TF_DIR" output -raw key_name)" ||
    fail "key-pair name is unavailable from Terraform state"
  budget_name="$(terraform -chdir="$TF_DIR" output -raw budget_name)" ||
    fail "budget name is unavailable from Terraform state"
  vpc_id="$(terraform -chdir="$TF_DIR" output -raw vpc_id)" ||
    fail "dedicated VPC identifier is unavailable from Terraform state"

  printf 'This destroys the Recipe Finder demo resources in AWS account %s:\n' \
    "$(aws sts get-caller-identity --query Account --output text)"
  printf '  Instance: %s\n  VPC: %s\n  Security group: %s\n  Elastic IP allocation: %s\n  Key pair: %s\n  Budget: %s\n' \
    "$instance_id" "$vpc_id" "$security_group_id" "$allocation_id" "$key_name" "$budget_name"
  printf 'Type DESTROY RECIPE FINDER DEMO RESOURCES to continue: '
  IFS= read -r confirmation
  [[ "$confirmation" == "DESTROY RECIPE FINDER DEMO RESOURCES" ]] ||
    fail "operator did not confirm teardown"

  if ! terraform -chdir="$TF_DIR" destroy -auto-approve; then
    fail "Terraform destroy failed; state is retained for recovery"
  fi
  state_resources="$(terraform -chdir="$TF_DIR" state list)" ||
    fail "could not verify the Terraform state after destroy"
  [[ -z "$state_resources" ]] || fail "Terraform state still tracks resources: $state_resources"

  temporary_dir="$(mktemp -d)"
  trap 'rm -rf -- "$temporary_dir"' EXIT
  account_id="$(aws sts get-caller-identity --query Account --output text)"
  for attempt in {1..12}; do
    if verify_removed "$account_id" "$instance_id" "$security_group_id" \
      "$allocation_id" "$key_name" "$budget_name" "$vpc_id" "$temporary_dir/aws-error"; then
      printf 'Demo teardown verified: all stack-owned AWS resources are removed.\n'
      return 0
    fi
    if (( attempt < 12 )); then
      sleep 10
    fi
  done

  fail "resource verification did not complete; Terraform state is retained"
}

main "$@"
