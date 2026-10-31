#!/bin/sh
set -eu

marker=/app/.compose-state/import-complete
if [ -f "$marker" ]; then
  printf '%s\n' "Compose import already completed; skipping."
  exit 0
fi

npm run import:data

temporary_marker="${marker}.tmp.$$"
trap 'rm -f "$temporary_marker"' EXIT
printf '%s\n' "completed" > "$temporary_marker"
mv "$temporary_marker" "$marker"
