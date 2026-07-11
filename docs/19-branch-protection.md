# ブランチ保護とローカルゲート運用

`main` は GitHub Ruleset で保護し、検証を通過した変更のみをマージする。本リポジトリは
GitHub Actions 非依存（[ADR](superpowers/specs/2026-07-11-de-github-actions-design.md)）のため、
必須ステータスチェックは GitGuardian（GitHub App）とし、SAST/依存監査/型/テストは
ローカル pre-push ゲートで担保する。

## Ruleset: `main-protection`

`main`（`~DEFAULT_BRANCH`）に対する branch ruleset（enforcement=active）。

| ルール | 設定 | 目的 |
|---|---|---|
| Pull request 必須 | 承認 0 件・レビュースレッド解決必須 | 直接 push を防ぐ。ソロ運用でも自己マージ可能に保ちつつ、未解決の指摘を残さない |
| 必須ステータスチェック | `GitGuardian Security Checks` のみ | 秘密混入を PR でブロック（Actions チェックは存在しない） |
| Force push 禁止 | `non_fast_forward` | 履歴改ざん・巻き戻しを防ぐ |
| ブランチ削除禁止 | `deletion` | `main` の誤削除を防ぐ |

### 管理者バイパス方針と緊急手順

- **bypass_actors**: Repository Role = Admin（`bypass_mode: always`）。
- 通常運用ではバイパスを使わず、必ず PR 経由でマージする。
- **緊急時**（インシデント対応でゲート復旧を待てない等）に限り、管理者が bypass して直接
  `main` へ push、または `gh pr merge --admin` する。使用時は次を必須とする:
  - 事後に理由・変更内容・影響範囲を Issue へ記録する（追跡可能性）。
  - バイパスした変更にも pre-push ゲート（`make security` / `make validate` / `pnpm -r test`）を
    ローカルで実行し、結果を残す。
- Ruleset は完全に取消・再作成可能。無効化する場合も Issue で理由を残す。

### 再作成コマンド

```bash
gh api --method POST repos/<owner>/<repo>/rulesets --input infra/github/main-protection.ruleset.json
# 確認: gh api repos/<owner>/<repo>/rulesets
```

Ruleset 定義は `infra/github/main-protection.ruleset.json` に版管理する（IaC 化）。

## ローカルゲート（必須要件）

マージ前に満たすべき要件:

1. **GitGuardian Security Checks = success**（PR 上の唯一の必須チェック）。
2. **人間レビュー**（CODEOWNERS）— AI 生成コードも人間が責任を持ってレビューする。
3. **pre-push ゲート通過**（push 時にローカルで自動実行、`.pre-commit-config.yaml`）:
   - `pnpm -r build` / `pnpm -r typecheck` / `pnpm -r test`
   - `make security`（Semgrep + osv-scanner）
   - `bicep build`（`infra/` 変更時）

段階別の内訳は [AppSecパイプライン](18-appsec-pipeline.md) を参照。

### 導入とブロックテスト

```bash
./scripts/setup-dev.sh                 # pre-commit install（pre-commit + pre-push）
make hooks                             # pre-commit run --all-files（全hook）
make validate && make security         # 構文・検証一式 + SAST・依存監査
```

- **発火確認**: 秘密情報を含むダミー行を commit しようとすると `detect-private-key` が
  ブロックすること、脆弱依存を追加すると `osv-scanner` が pre-push で失敗することを確認する。
- フックの結果を `--no-verify` で無断回避しない（`guard-destructive.sh` がブロックする）。

## 検証記録（2026-07-12 時点）

- `make validate`: Repository validation passed（全 pre-commit hook Passed）。
- `make security`: Semgrep 255 rules / **0 findings**、osv-scanner **0 issues**。
- `pnpm -r test`: **50 passed**（core 7 / decision 23 / ingest-func 20）。
- `make bicep`: pass。
- Ruleset `main-protection`（id 18813561）を `main` に適用済み・enforcement=active。
