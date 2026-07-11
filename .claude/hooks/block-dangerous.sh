#!/usr/bin/env bash
set -euo pipefail
INPUT="$(cat)"
COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""')"

DENY_REGEX='(^|[;&|[:space:]])(rm[[:space:]]+-rf[[:space:]]+/|git[[:space:]]+push[[:space:]]+--force|git[[:space:]]+reset[[:space:]]+--hard|az[[:space:]]+group[[:space:]]+delete|az[[:space:]].*delete|kubectl[[:space:]]+delete[[:space:]]+namespace)'

if printf '%s' "$COMMAND" | grep -Eiq "$DENY_REGEX"; then
  jq -n --arg reason "Destructive or irreversible command blocked by project policy" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
  exit 0
fi

exit 0
