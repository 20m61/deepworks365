#!/usr/bin/env bash
set -euo pipefail
OWNER="${GITHUB_OWNER:-20m61}"
TITLE="${GITHUB_PROJECT_TITLE:-OIP Delivery}"

if ! gh project list --owner "$OWNER" --format json >/dev/null; then
  echo "ERROR: GitHub Projectsへアクセスできません。" >&2
  echo "OAuth scopeを追加してから再実行してください:" >&2
  echo "  gh auth refresh -s project,read:project" >&2
  exit 2
fi

existing_number="$(gh project list --owner "$OWNER" --format json --jq ".projects[] | select(.title == \"$TITLE\") | .number" | head -n1)"
if [[ -n "$existing_number" ]]; then
  gh project list --owner "$OWNER" --format json --jq ".projects[] | select(.title == \"$TITLE\")"
  exit 0
fi

if ! gh project create --owner "$OWNER" --title "$TITLE"; then
  echo "ERROR: Projectを作成できませんでした。権限とownerを確認してください。" >&2
  echo "  gh auth refresh -s project,read:project" >&2
  exit 3
fi

echo "Project created: $TITLE"
echo "Configure custom fields and views using docs/16-github-project.md"
