#!/usr/bin/env bash
set -euo pipefail
OWNER="${GITHUB_OWNER:-20m61}"
REPO_NAME="${GITHUB_REPO:-deepworks365}"
REPO="$OWNER/$REPO_NAME"
PROJECT_TITLE="${GITHUB_PROJECT_TITLE:-OIP Delivery}"
DRY_RUN="${DRY_RUN:-0}"

PROJECT_NUMBER="$(gh project list --owner "$OWNER" --format json --jq ".projects[] | select(.title == \"$PROJECT_TITLE\") | .number" | head -n1 || true)"

for file in backlog/issues/*.md; do
  title="$(sed -n '1s/^# //p' "$file")"
  labels="$(sed -n '2s/^<!-- labels: \(.*\) -->$/\1/p' "$file")"
  body_file="$(mktemp)"
  tail -n +3 "$file" > "$body_file"
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "Would create: $title [$labels]"
    rm -f "$body_file"
    continue
  fi
  if gh issue list --repo "$REPO" --search "\"$title\" in:title" --json title --jq '.[].title' | grep -Fxq "$title"; then
    echo "Skip existing: $title"
    rm -f "$body_file"
    continue
  fi
  args=(issue create --repo "$REPO" --title "$title" --body-file "$body_file")
  IFS=',' read -ra label_array <<<"$labels"
  for label in "${label_array[@]}"; do
    [[ -n "$label" ]] && args+=(--label "${label# }")
  done
  url="$(gh "${args[@]}")"
  echo "Created: $url"
  if [[ -n "$PROJECT_NUMBER" ]]; then
    gh project item-add "$PROJECT_NUMBER" --owner "$OWNER" --url "$url" >/dev/null
  fi
  rm -f "$body_file"
done
