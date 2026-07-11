#!/usr/bin/env bash
set -euo pipefail
OWNER="${GITHUB_OWNER:-20m61}"
TITLE="${GITHUB_PROJECT_TITLE:-OIP Delivery}"

if gh project list --owner "$OWNER" --format json --jq ".projects[] | select(.title == \"$TITLE\") | .number" | grep -q .; then
  gh project list --owner "$OWNER" --format json --jq ".projects[] | select(.title == \"$TITLE\")"
  exit 0
fi

gh project create --owner "$OWNER" --title "$TITLE"
echo "Project created: $TITLE"
echo "Configure custom fields and views using docs/16-github-project.md"
