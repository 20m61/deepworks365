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

# osv-scanner (依存監査 / 旧 Dependency Review の代替)。
# go install を優先 (macOS 13 Ventura は brew bottle が無くソースビルドになるため)。
if ! command -v osv-scanner >/dev/null 2>&1; then
  if command -v go >/dev/null 2>&1; then
    GOBIN="${GOBIN:-$HOME/go/bin}" go install github.com/google/osv-scanner/v2/cmd/osv-scanner@latest || true
    # GOBIN が PATH に無い場合に備え ~/.local/bin へリンクする。
    if [ -x "$HOME/go/bin/osv-scanner" ] && [ -d "$HOME/.local/bin" ]; then
      ln -sf "$HOME/go/bin/osv-scanner" "$HOME/.local/bin/osv-scanner"
    fi
  elif command -v brew >/dev/null 2>&1; then
    brew install osv-scanner || true
  fi
fi

# bicep CLI (IaC 構文検証)。az 全体は Ventura で重いため standalone binary を優先。
if ! command -v bicep >/dev/null 2>&1 && ! command -v az >/dev/null 2>&1; then
  case "$(uname -s)/$(uname -m)" in
    Darwin/arm64) asset=bicep-osx-arm64 ;;
    Darwin/*)     asset=bicep-osx-x64 ;;
    Linux/aarch64) asset=bicep-linux-arm64 ;;
    Linux/*)      asset=bicep-linux-x64 ;;
    *)            asset="" ;;
  esac
  if [ -n "$asset" ] && [ -d "$HOME/.local/bin" ]; then
    if curl -fsSL -o "$HOME/.local/bin/bicep" \
      "https://github.com/Azure/bicep/releases/latest/download/$asset"; then
      chmod +x "$HOME/.local/bin/bicep"
    fi
  fi
fi

# git フックを登録 (pre-commit + pre-push)。
if command -v pre-commit >/dev/null 2>&1; then
  pre-commit install --install-hooks
  pre-commit install --hook-type pre-push
fi

echo "Development environment ready. Run: make validate && make security"
