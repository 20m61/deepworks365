#!/usr/bin/env bash
set -euo pipefail

required=(
  README.md CLAUDE.md SECURITY.md
  docs/01-project-charter.md docs/03-architecture.md
  docs/12-security-architecture.md docs/14-risk-register.md
)
for file in "${required[@]}"; do
  [[ -s "$file" ]] || { echo "Missing required file: $file"; exit 1; }
done

if command -v jq >/dev/null 2>&1; then
  find . -type f -name '*.json' -not -path './.git/*' -print0 | xargs -0 -n1 jq empty
fi
if command -v yamllint >/dev/null 2>&1; then
  yamllint -d '{extends: relaxed, rules: {line-length: disable}}' .github azure.yaml .semgrep.yml
fi
if command -v shellcheck >/dev/null 2>&1; then
  find scripts .claude/hooks -type f -name '*.sh' -print0 | xargs -0 shellcheck
fi
if command -v markdownlint-cli2 >/dev/null 2>&1; then
  markdownlint-cli2 '**/*.md' '#node_modules'
fi
if command -v az >/dev/null 2>&1; then
  az bicep build --file infra/main.bicep --stdout >/dev/null
fi

echo "Repository validation passed."
