#!/usr/bin/env bash
set -euo pipefail

# SAST: semgrep を中心に据える (旧 CodeQL の代替)。
if ! command -v semgrep >/dev/null 2>&1; then
  echo "semgrep is required. Run scripts/setup-dev.sh"
  exit 1
fi
semgrep scan --config auto --config .semgrep.yml --error .
echo "SAST (semgrep) passed."

# 依存監査: osv-scanner (旧 Dependency Review の代替)。lockfile がある場合のみ実行。
if command -v osv-scanner >/dev/null 2>&1; then
  if git ls-files -- '*lock*' 'requirements*.txt' 'go.mod' 'Cargo.toml' 'package.json' | grep -q .; then
    osv-scanner scan --recursive .
    echo "Dependency audit (osv-scanner) passed."
  else
    echo "No lockfiles found; skipping dependency audit."
  fi
else
  echo "osv-scanner not installed; skipping dependency audit. Run scripts/setup-dev.sh"
fi

echo "Security scan passed."
