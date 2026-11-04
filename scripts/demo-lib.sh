#!/usr/bin/env bash

demo_error() {
  printf 'Demo deployment: %s\n' "$*" >&2
}

demo_read_config() {
  local config_file="${DEMO_CONFIG_FILE:-${DEMO_ROOT_DIR}/.env.demo}"
  local line key value

  if [[ ! -r "$config_file" ]]; then
    demo_error "configuration file not found or unreadable: $config_file (copy .env.demo.example to .env.demo)"
    return 1
  fi

  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*$ || "$line" =~ ^[[:space:]]*# ]] && continue
    if [[ "$line" != *=* ]]; then
      demo_error "invalid configuration line in $config_file"
      return 1
    fi

    key="${line%%=*}"
    value="${line#*=}"
    case "$key" in
      DEMO_REGION|DEMO_SSH_CIDR|DEMO_PUBLIC_KEY_PATH|DEMO_GHCR_OWNER|PREPARED_DATA_DIR|DEMO_IMAGE_TAG|DEMO_ESTIMATED_COST_USD|DEMO_BUDGET_LIMIT_USD|DEMO_BUDGET_EMAIL|DEMO_INSTANCE_TYPE)
        ;;
      *)
        demo_error "unsupported setting '$key' in $config_file"
        return 1
        ;;
    esac

    if [[ "$value" == *$'\r'* || "$value" == *$'\n'* ]]; then
      demo_error "invalid multiline value for $key in $config_file"
      return 1
    fi

    printf -v "$key" '%s' "$value"
    export "$key"
  done < "$config_file"
  DEMO_INSTANCE_TYPE="${DEMO_INSTANCE_TYPE:-t3.medium}"
  export DEMO_INSTANCE_TYPE
}

demo_validate_public_ipv4_cidr() {
  local cidr="$1"
  awk -F'[./]' '
    NF != 5 || $5 != 32 { exit 1 }
    {
      for (i = 1; i <= 4; i++) {
        if ($i !~ /^[0-9]+$/ || $i < 0 || $i > 255) exit 1
      }
      if ($1 == 0 || $1 == 10 || $1 == 127 || $1 >= 224) exit 1
      if ($1 == 169 && $2 == 254) exit 1
      if ($1 == 172 && $2 >= 16 && $2 <= 31) exit 1
      if ($1 == 192 && ($2 == 168 || ($2 == 0 && $3 == 2) || ($2 == 88 && $3 == 99))) exit 1
      if ($1 == 198 && ($2 == 18 || $2 == 19 || ($2 == 51 && $3 == 100))) exit 1
      if ($1 == 203 && $2 == 0 && $3 == 113) exit 1
    }
  ' <<< "$cidr"
}

demo_review_is_complete() {
  local review_file="${DEMO_ROOT_DIR}/docs/demo-security-review.md"
  [[ -r "$review_file" ]] || return 1
  grep -qE '^- \[ \]' "$review_file" && return 1
  grep -qE '^- \[[xX]\]' "$review_file" || return 1
  grep -qF '**Reviewer**: _Not reviewed_' "$review_file" && return 1
  grep -qF '**Review date**: _Not reviewed_' "$review_file" && return 1
  grep -qF '**Approval to provision billable AWS resources**: _Not granted_' "$review_file" && return 1
  return 0
}

demo_image_source_matches_checkout() {
  local current_revision image_revision
  current_revision="$(git -C "$DEMO_ROOT_DIR" rev-parse HEAD)" || return 1
  image_revision="$(git -C "$DEMO_ROOT_DIR" rev-parse --verify "${DEMO_IMAGE_TAG}^{commit}" 2>/dev/null)" ||
    return 1
  [[ "$image_revision" == "$current_revision" ]] && return 0

  git -C "$DEMO_ROOT_DIR" diff --quiet "$image_revision" "$current_revision" -- \
    Dockerfile \
    api \
    package.json \
    package-lock.json \
    scripts/compose-import.sh \
    scripts/import-data.ts \
    tsconfig.json \
    vite.config.ts \
    web
}

demo_validate_configuration() {
  local required
  for required in DEMO_REGION DEMO_SSH_CIDR DEMO_PUBLIC_KEY_PATH DEMO_GHCR_OWNER PREPARED_DATA_DIR DEMO_IMAGE_TAG DEMO_ESTIMATED_COST_USD DEMO_BUDGET_LIMIT_USD DEMO_BUDGET_EMAIL; do
    if [[ -z "${!required:-}" ]]; then
      demo_error "required setting $required is missing from .env.demo"
      return 1
    fi
  done

  if ! demo_validate_public_ipv4_cidr "$DEMO_SSH_CIDR"; then
    demo_error "DEMO_SSH_CIDR must be one routable public IPv4 address with a /32 mask"
    return 1
  fi
  if [[ ! -r "$DEMO_PUBLIC_KEY_PATH" || "$DEMO_PUBLIC_KEY_PATH" != *.pub ]]; then
    demo_error "DEMO_PUBLIC_KEY_PATH must identify a readable SSH public-key file ending in .pub"
    return 1
  fi
  if [[ ! "$DEMO_GHCR_OWNER" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
    demo_error "DEMO_GHCR_OWNER must be a lowercase GitHub owner name"
    return 1
  fi
  if [[ ! "$DEMO_IMAGE_TAG" =~ ^[0-9a-f]{40}$ ]]; then
    demo_error "DEMO_IMAGE_TAG must be the full 40-character source commit SHA"
    return 1
  fi
  if [[ ! "$DEMO_ESTIMATED_COST_USD" =~ ^[0-9]+([.][0-9]+)?$ || ! "$DEMO_BUDGET_LIMIT_USD" =~ ^[0-9]+([.][0-9]+)?$ ]]; then
    demo_error "estimated cost and budget limit must be positive decimal USD amounts"
    return 1
  fi
  if ! awk -v estimate="$DEMO_ESTIMATED_COST_USD" -v limit="$DEMO_BUDGET_LIMIT_USD" 'BEGIN { exit !(estimate > 0 && limit > 0 && estimate <= limit) }'; then
    demo_error "estimated cost must be greater than zero and no greater than the positive budget limit"
    return 1
  fi
  if [[ ! "$DEMO_BUDGET_EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]; then
    demo_error "DEMO_BUDGET_EMAIL must be a valid notification email address"
    return 1
  fi
  if [[ ! -d "$PREPARED_DATA_DIR" || ! -r "$PREPARED_DATA_DIR" ]]; then
    demo_error "PREPARED_DATA_DIR must be a readable directory containing prepared recipe CSVs"
    return 1
  fi
  local file
  for file in recipes.csv ingredients.csv recipe_ingredients.csv ingredient_aliases.csv ingredient_categories.csv recipe_cuisines.csv; do
    if [[ ! -r "$PREPARED_DATA_DIR/$file" ]]; then
      demo_error "prepared data file is missing: $PREPARED_DATA_DIR/$file"
      return 1
    fi
  done

  if ! demo_image_source_matches_checkout; then
    demo_error "DEMO_IMAGE_TAG must identify a commit with the same application image build inputs as the checked-out revision"
    return 1
  fi

  if ! demo_review_is_complete; then
    demo_error "complete docs/demo-security-review.md and record reviewer, date, and approval before any cloud changes"
    return 1
  fi
}
