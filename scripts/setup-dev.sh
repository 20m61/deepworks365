#!/usr/bin/env bash
set -euo pipefail

if command -v corepack >/dev/null 2>&1; then corepack enable || true; fi
if command -v pipx >/dev/null 2>&1; then
  pipx install semgrep --force || true
elif command -v python3 >/dev/null 2>&1; then
  python3 -m pip install --user semgrep || true
fi

echo "Development environment ready. Run: make validate && make security"
