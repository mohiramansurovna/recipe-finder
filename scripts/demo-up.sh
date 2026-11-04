#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

DEMO_ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
TF_DIR="$DEMO_ROOT_DIR/infra/terraform"
temporary_dir=""
password=""
source "$DEMO_ROOT_DIR/scripts/demo-lib.sh"

cleanup() {
  if [[ -n "$temporary_dir" ]]; then
    rm -rf -- "$temporary_dir"
  fi
  unset password
}
trap cleanup EXIT

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    demo_error "required command not found: $1"
    exit 1
  }
}

confirm_provisioning() {
  local confirmation
  printf 'Region: %s\nEstimated demo cost: US$%s\nBudget alert: US$%s/month (%s)\n' \
    "$DEMO_REGION" "$DEMO_ESTIMATED_COST_USD" "$DEMO_BUDGET_LIMIT_USD" "$DEMO_BUDGET_EMAIL"
  printf 'This creates billable AWS resources. Type CREATE BILLABLE AWS RESOURCES to continue: '
  IFS= read -r confirmation
  if [[ "$confirmation" != "CREATE BILLABLE AWS RESOURCES" ]]; then
    demo_error "operator did not confirm provisioning"
    exit 1
  fi
}

wait_for_console_host_key() {
  local instance_id="$1"
  local public_ip="$2"
  local known_hosts_file="$3"
  local deadline=$((SECONDS + 600))
  local console_output expected_fingerprint candidate actual_fingerprint

  while (( SECONDS < deadline )); do
    console_output="$(aws ec2 get-console-output --latest --instance-id "$instance_id" --query Output --output text 2>/dev/null || true)"
    expected_fingerprint="$(printf '%s\n' "$console_output" | sed -n 's/.*DEMO_SSH_HOST_KEY_SHA256=\(SHA256:[^[:space:]]*\).*/\1/p' | tail -n 1)"
    if [[ "$expected_fingerprint" == SHA256:* ]]; then
      candidate="$(mktemp)"
      if ssh-keyscan -T 5 -t ed25519 "$public_ip" > "$candidate" 2>/dev/null; then
        actual_fingerprint="$(ssh-keygen -lf "$candidate" -E sha256 | awk 'NR == 1 {print $2}')"
        if [[ "$actual_fingerprint" == "$expected_fingerprint" ]]; then
          install -m 600 "$candidate" "$known_hosts_file"
          rm -f "$candidate"
          return 0
        fi
      fi
      rm -f "$candidate"
    fi
    sleep 10
  done

  demo_error "could not verify the SSH host key against AWS-authenticated instance console output"
  return 1
}

wait_for_ssh() {
  local public_ip="$1"
  local key_file="$2"
  local known_hosts_file="$3"
  local deadline=$((SECONDS + 300))
  local -a ssh_args=(
    -i "$key_file"
    -o "UserKnownHostsFile=$known_hosts_file"
    -o StrictHostKeyChecking=yes
    -o IdentitiesOnly=yes
    -o BatchMode=yes
    -o ConnectTimeout=8
  )

  while (( SECONDS < deadline )); do
    if ssh "${ssh_args[@]}" "ubuntu@$public_ip" true >/dev/null 2>&1; then
      return 0
    fi
    sleep 5
  done
  demo_error "SSH did not become available within five minutes"
  return 1
}

main() {
  local key_file plan_file instance_id public_ip public_hostname
  local ssh_command
  local -a ssh_args

  demo_read_config || exit 1
  demo_validate_configuration || exit 1
  for command_name in aws terraform git ssh ssh-keyscan ssh-keygen rsync curl; do
    require_command "$command_name"
  done

  key_file="${DEMO_PUBLIC_KEY_PATH%.pub}"
  if [[ ! -r "$key_file" ]]; then
    demo_error "matching SSH private key is unreadable: $key_file"
    exit 1
  fi
  export TF_VAR_region="$DEMO_REGION"
  export TF_VAR_ssh_allowed_cidr="$DEMO_SSH_CIDR"
  export TF_VAR_public_key_path="$DEMO_PUBLIC_KEY_PATH"
  export TF_VAR_budget_limit_usd="$DEMO_BUDGET_LIMIT_USD"
  export TF_VAR_budget_notification_email="$DEMO_BUDGET_EMAIL"
  export TF_VAR_instance_type="$DEMO_INSTANCE_TYPE"
  export AWS_REGION="$DEMO_REGION"
  export AWS_DEFAULT_REGION="$DEMO_REGION"

  aws sts get-caller-identity >/dev/null
  terraform -chdir="$TF_DIR" fmt -check -recursive
  terraform -chdir="$TF_DIR" init
  terraform -chdir="$TF_DIR" validate

  plan_file="$TF_DIR/demo.tfplan"
  terraform -chdir="$TF_DIR" plan -out="$plan_file"
  confirm_provisioning
  terraform -chdir="$TF_DIR" apply "$plan_file"

  instance_id="$(terraform -chdir="$TF_DIR" output -raw instance_id)"
  public_ip="$(terraform -chdir="$TF_DIR" output -raw public_ip)"
  public_hostname="$(terraform -chdir="$TF_DIR" output -raw public_hostname)"
  password="$(terraform -chdir="$TF_DIR" output -raw neo4j_password)"
  temporary_dir="$(mktemp -d)"
  wait_for_console_host_key "$instance_id" "$public_ip" "$temporary_dir/known_hosts"
  wait_for_ssh "$public_ip" "$key_file" "$temporary_dir/known_hosts"

  ssh_args=(
    -i "$key_file"
    -o "UserKnownHostsFile=$temporary_dir/known_hosts"
    -o StrictHostKeyChecking=yes
    -o IdentitiesOnly=yes
    -o BatchMode=yes
    -o ConnectTimeout=10
  )
  printf -v ssh_command '%q ' \
    ssh -i "$key_file" \
    -o "UserKnownHostsFile=$temporary_dir/known_hosts" \
    -o StrictHostKeyChecking=yes \
    -o IdentitiesOnly=yes \
    -o BatchMode=yes

  ssh "${ssh_args[@]}" "ubuntu@$public_ip" \
    'sudo chown ubuntu:ubuntu /opt/recipe-graph && sudo chmod 0750 /opt/recipe-graph'

  printf '%s\n' \
    "NEO4J_PASSWORD=$password" \
    "DEMO_HOSTNAME=$public_hostname" \
    "DEMO_IMAGE_TAG=$DEMO_IMAGE_TAG" \
    "DEMO_GHCR_OWNER=$DEMO_GHCR_OWNER" |
    ssh "${ssh_args[@]}" "ubuntu@$public_ip" \
      "sudo sh -c 'umask 077; cat > /opt/recipe-graph/.env.demo'"

  rsync -a -e "$ssh_command" \
    "$DEMO_ROOT_DIR/docker-compose.demo.yml" "$DEMO_ROOT_DIR/Caddyfile.demo" \
    "ubuntu@$public_ip:/opt/recipe-graph/"
  rsync -az --files-from=- \
    -e "$ssh_command" \
    "$PREPARED_DATA_DIR/" "ubuntu@$public_ip:/opt/recipe-graph/data/prepared/" <<'CSV_FILES'
recipes.csv
ingredients.csv
recipe_ingredients.csv
ingredient_aliases.csv
ingredient_categories.csv
recipe_cuisines.csv
CSV_FILES

  ssh "${ssh_args[@]}" "ubuntu@$public_ip" \
    'sudo docker compose --env-file /opt/recipe-graph/.env.demo -f /opt/recipe-graph/docker-compose.demo.yml pull'
  ssh "${ssh_args[@]}" "ubuntu@$public_ip" \
    'cd /opt/recipe-graph && sudo docker compose --env-file .env.demo -f docker-compose.demo.yml up -d'

  if ! ssh "${ssh_args[@]}" "ubuntu@$public_ip" \
    'cd /opt/recipe-graph && deadline=$((SECONDS + 900)); while [ "$SECONDS" -lt "$deadline" ]; do status=$(sudo docker compose --env-file .env.demo -f docker-compose.demo.yml ps -a --format "{{.Service}} {{.ExitCode}}" importer); if [ "$status" = "importer 0" ]; then exit 0; fi; if printf "%s" "$status" | grep -q "importer .*"; then exit 1; fi; sleep 5; done; exit 1'; then
    demo_error "prepared data import failed or timed out; Terraform state is retained for recovery"
    exit 1
  fi

  local deadline=$((SECONDS + 600))
  until curl --fail --silent --show-error "https://$public_hostname/" >/dev/null 2>&1 &&
    curl --fail --silent --show-error "https://$public_hostname/api/filters" >/dev/null 2>&1; do
    if (( SECONDS >= deadline )); then
      demo_error "HTTPS or API readiness timed out; Terraform state is retained for recovery"
      exit 1
    fi
    sleep 10
  done

  printf 'Demo ready: https://%s\n' "$public_hostname"
  printf 'Image revision: %s\n' "$DEMO_IMAGE_TAG"
}

main "$@"
