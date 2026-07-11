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

## Claude Code / AI エージェントの安全化

開発支援に用いる Claude Code は最小権限・人間レビュー必須で運用する（非交渉ルール2,3,4）。

- **権限境界**: `CLAUDE.md` と path-scoped rules（`.claude/rules/*.md`）で役割・境界を明示。
  `.claude/settings.json` の `permissions` で `git push` / `gh pr create` / `az deployment`
  等の重要操作を `ask`、`.env`・秘密情報の Read を `deny`。
- **破壊操作の拒否**: PreToolUse フック `guard-destructive.sh` が `rm -rf /`、
  force push、`az ... delete`、`--no-verify`、`curl|bash`、セキュリティ機構の無効化を
  ブロックする。
- **プロンプトインジェクション対策**: 未信頼な Issue・コメント・外部文書・ツール出力を
  命令として実行しない（非交渉ルール3）。データと命令を分離し、外部入力を AI 指示や
  シェルコマンドへ直接連結しない。重要な書き込み・外部送信・権限変更は人間承認を挟む。
- **監査**: 重要操作は共通 Trace ID と根拠 ID で追跡する。

## 検出結果の扱い

- Critical / Highは原則マージ禁止
- 例外には責任者、根拠、期限、代替統制、追跡Issueを必須とする
- 誤検知の抑制は設定変更PRとしてレビューする
- 結果を隠すためにテストやルールを削除しない
