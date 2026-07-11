#!/usr/bin/env bash
set -euo pipefail
INPUT="$(cat)"
FILE="$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // ""')"

case "$FILE" in
  *.json)
    jq empty "$FILE" >/dev/null || {
      jq -n '{decision:"block",reason:"Edited JSON is invalid. Fix syntax before continuing."}'
      exit 0
    }
    ;;
  *.yml|*.yaml)
    if command -v yamllint >/dev/null 2>&1; then
      yamllint -d relaxed "$FILE" >/dev/null || {
        jq -n '{decision:"block",reason:"Edited YAML failed yamllint."}'
        exit 0
      }
    fi
    ;;
esac
exit 0
