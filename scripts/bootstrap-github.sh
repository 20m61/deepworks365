#!/usr/bin/env bash
set -euo pipefail
OWNER="${GITHUB_OWNER:-20m61}"
REPO_NAME="${GITHUB_REPO:-deep-work}"
REPO="$OWNER/$REPO_NAME"
DESCRIPTION="Microsoft 365 / Entra ID / Azure based organizational intelligence and decision platform"

gh auth status

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git init -b main
fi

git add .
if ! git diff --cached --quiet; then
  git commit -m "chore: initialize organizational intelligence platform"
fi

if ! gh repo view "$REPO" >/dev/null 2>&1; then
  gh repo create "$REPO" --public --description "$DESCRIPTION" --source . --remote origin --push
else
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$REPO.git"
  git push -u origin main
fi

GITHUB_OWNER="$OWNER" GITHUB_REPO="$REPO_NAME" ./scripts/create-labels.sh

project_available=1
if ! GITHUB_OWNER="$OWNER" ./scripts/create-project.sh; then
  project_available=0
  echo "WARNING: GitHub Projectの作成をスキップしました。Issue作成は継続します。" >&2
  echo "Projectを利用する場合は次を実行してください:" >&2
  echo "  gh auth refresh -s project,read:project" >&2
  echo "  GITHUB_OWNER=$OWNER ./scripts/create-project.sh" >&2
fi

GITHUB_OWNER="$OWNER" GITHUB_REPO="$REPO_NAME" ./scripts/create-issues.sh

echo "Repository: https://github.com/$REPO"
if [[ "$project_available" == "1" ]]; then
  echo "Project: https://github.com/users/$OWNER/projects"
else
  echo "Project: not created (see warning above)"
fi
