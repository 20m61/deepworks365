#!/usr/bin/env bash
set -euo pipefail

# SAST: semgrep を中心に据える (旧 CodeQL の代替)。
if ! command -v semgrep >/dev/null 2>&1; then
  echo "semgrep is required. Run scripts/setup-dev.sh"
  exit 1
fi
semgrep scan --config auto --config .semgrep.yml --error .
echo "SAST (semgrep) passed."

# 依存監査: osv-scanner (旧 Dependency Review の代替)。
# package source (lockfile 等) が無い場合 osv-scanner は exit 128 を返すため skip 扱いとする。
# 0=脆弱性なし / 1=脆弱性あり(失敗) / 128=対象なし(skip) / その他=エラー(失敗)。
if command -v osv-scanner >/dev/null 2>&1; then
  set +e
  osv-scanner scan --recursive .
  osv_code=$?
  set -e
  case "$osv_code" in
    0)   echo "Dependency audit (osv-scanner) passed." ;;
    128) echo "No package sources found; skipping dependency audit." ;;
    *)   echo "Dependency audit (osv-scanner) failed (exit $osv_code)."; exit "$osv_code" ;;
  esac
else
  echo "osv-scanner not installed; skipping dependency audit. Run scripts/setup-dev.sh"
fi

echo "Security scan passed."
