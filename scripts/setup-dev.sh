#!/usr/bin/env bash
set -euo pipefail

if command -v corepack >/dev/null 2>&1; then corepack enable || true; fi

# semgrep (SAST) と pre-commit (ローカルゲート) を導入する。uv > pipx > pip の順で優先。
if command -v uv >/dev/null 2>&1; then
  uv tool install semgrep || true
  uv tool install pre-commit || true
elif command -v pipx >/dev/null 2>&1; then
  pipx install semgrep --force || true
  pipx install pre-commit --force || true
elif command -v python3 >/dev/null 2>&1; then
  python3 -m pip install --user semgrep pre-commit || true
fi

# osv-scanner (依存監査 / 旧 Dependency Review の代替)。brew があれば導入。
if ! command -v osv-scanner >/dev/null 2>&1 && command -v brew >/dev/null 2>&1; then
  brew install osv-scanner || true
fi

# git フックを登録 (pre-commit + pre-push)。
if command -v pre-commit >/dev/null 2>&1; then
  pre-commit install --install-hooks
  pre-commit install --hook-type pre-push
fi

echo "Development environment ready. Run: make validate && make security"
