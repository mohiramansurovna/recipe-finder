#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 1 || ! "$1" =~ ^https://[a-zA-Z0-9.-]+$ ]]; then
  printf 'Usage: %s https://<demo-hostname>\n' "$0" >&2
  exit 2
fi

base_url="$1"
curl --fail --silent --show-error --proto '=https' --tlsv1.2 --max-time 15 \
  "$base_url/" >/dev/null

response_file="$(mktemp)"
trap 'rm -f "$response_file"' EXIT
curl --fail --silent --show-error --proto '=https' --tlsv1.2 --max-time 30 \
  --header 'Content-Type: application/json' \
  --data-raw '{"included":["chicken"],"excluded":[],"excludedCategories":[],"cuisines":[],"maxMinutes":null,"cursor":null}' \
  "$base_url/api/recipes/search" > "$response_file"

node --input-type=module - "$response_file" <<'NODE'
import { readFileSync } from "node:fs";

const response = JSON.parse(readFileSync(process.argv[2], "utf8"));
if (!Array.isArray(response.recipes) || response.recipes.length === 0) {
  throw new Error("Recipe search returned no matching recipes.");
}
if (!Number.isInteger(response.totalCount) || response.totalCount < 1) {
  throw new Error("Recipe search response has no positive totalCount.");
}
console.log(`HTTPS recipe search passed with ${response.totalCount} matching recipes.`);
NODE
