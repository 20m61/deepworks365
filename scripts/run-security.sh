#!/usr/bin/env bash
set -euo pipefail

if ! command -v semgrep >/dev/null 2>&1; then
  echo "semgrep is required. Run scripts/setup-dev.sh"
  exit 1
fi

semgrep scan --config auto --config .semgrep.yml --error .
echo "Security scan passed."
