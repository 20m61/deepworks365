# AppSecパイプライン

GitHub Actions には依存せず、ゲートは **pre-commit（ローカル）＋ GitHub App** で構成する。
背景と決定は [ADR](superpowers/specs/2026-07-11-de-github-actions-design.md) を参照。

## ローカルゲート（pre-commit）

- **commit 段階**: 構文・フォーマット（markdownlint / yamllint / shellcheck / json・yaml 検証）、
  秘密検知（detect-private-key）、大容量ファイル検知
- **pre-push 段階**:
  1. Semgrep CE: 組織固有ルール、SAST、Secrets（`.semgrep.yml` ＋ auto）
  2. osv-scanner: 依存関係の既知脆弱性（lockfile 走査）
  3. Bicep build / Azure Policy確認（`az` 導入時）
- 実行: `make validate`（構文・検証一式）、`make security`（SAST＋依存監査）、`make hooks`（全hook）

## PR 段階

- GitGuardian（GitHub App）: 秘密検知（Actions ミニッツ非使用）
- 人間レビュー（CODEOWNERS）
- AI品質評価: 根拠性、権限逸脱、重大誤り

## 継続検査

- OWASP ZAP Baseline: 稼働環境が出来た時に手動 docker 実行（`.zap/rules.tsv`）
- 認証付きDAST: 専用環境とテストアカウント
- SBOM生成と脆弱性監視
- 定期的な脅威モデリングと侵入テスト
- OWASP ASVSへの要件マッピング

## 撤退した統制と代替

- CodeQL（深いデータフロー分析）→ semgrep で部分代替
- OpenSSF Scorecard（サプライチェーン姿勢）→ 撤退（GitHubホスト前提）
- Dependency Review Action → osv-scanner（ローカル）
- Dependabot（github-actions）→ ワークフロー撤去に伴い廃止

## 検出結果の扱い

- Critical / Highは原則マージ禁止
- 例外には責任者、根拠、期限、代替統制、追跡Issueを必須とする
- 誤検知の抑制は設定変更PRとしてレビューする
- 結果を隠すためにテストやルールを削除しない
