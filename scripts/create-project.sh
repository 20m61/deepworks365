#!/usr/bin/env bash
set -euo pipefail
OWNER="${GITHUB_OWNER:-20m61}"
TITLE="${GITHUB_PROJECT_TITLE:-OIP Delivery}"

project_json="$(mktemp)"
trap 'rm -f "$project_json"' EXIT

if ! gh project list --owner "$OWNER" --format json >"$project_json"; then
  echo "ERROR: GitHub Projectsへアクセスできません。" >&2
  echo "OAuth scopeを追加してから再実行してください:" >&2
  echo "  gh auth refresh -s project,read:project" >&2
  exit 2
fi

existing_number="$(jq -r --arg title "$TITLE" '.projects[] | select(.title == $title) | .number' "$project_json" | head -n1)"
if [[ -n "$existing_number" ]]; then
  jq -c --arg title "$TITLE" '.projects[] | select(.title == $title)' "$project_json"
  exit 0
fi

if ! gh project create --owner "$OWNER" --title "$TITLE"; then
  echo "ERROR: Projectを作成できませんでした。権限とownerを確認してください。" >&2
  echo "  gh auth refresh -s project,read:project" >&2
  exit 3
fi

echo "Project created: $TITLE"
echo "Configure custom fields and views using docs/16-github-project.md"
