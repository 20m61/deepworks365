#!/usr/bin/env bash
set -euo pipefail

# 必須ファイルの存在チェック (pre-commit では表現しにくいリポジトリ全体の不変条件)。
required=(
  README.md CLAUDE.md SECURITY.md
  docs/01-project-charter.md docs/03-architecture.md
  docs/12-security-architecture.md docs/14-risk-register.md
)
for file in "${required[@]}"; do
  [[ -s "$file" ]] || { echo "Missing required file: $file"; exit 1; }
done

# リンタ類 (json/yaml/shell/markdown) は pre-commit を単一の住処とする。
if command -v pre-commit >/dev/null 2>&1; then
  pre-commit run --all-files
else
  echo "pre-commit not installed; skipping linters. Run scripts/setup-dev.sh"
fi

# Bicep 成果物ビルド (standalone bicep 優先、無ければ az bicep)。
if command -v bicep >/dev/null 2>&1; then
  bicep build infra/main.bicep --stdout >/dev/null
elif command -v az >/dev/null 2>&1; then
  az bicep build --file infra/main.bicep --stdout >/dev/null
fi

echo "Repository validation passed."
