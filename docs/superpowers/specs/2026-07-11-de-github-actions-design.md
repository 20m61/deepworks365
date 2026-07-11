# GitHub Actions 完全非依存化 設計 (ADR 兼 spec)

- 日付: 2026-07-11
- ステータス: 承認済み（実装前）
- 関連: PR #1 / Issue #20 #22 #28 #29 #31 / docs/12 docs/18

## 背景 / 動機

GitHub アカウントが課金ロック状態にあり、Actions ジョブが起動段階で失敗する
（`The job was not started because your account is locked due to a billing issue.`）。
稼働中の 7 ワークフローすべてが startup_failure となり、全 PR が必須チェックを通せない。
一過性の課金問題に開発フローを縛られないため、**検証・セキュリティゲートをローカル(pre-commit)へ移行し、
GitHub Actions への依存を完全に排除する**。

> 注: 現在 SUCCESS の GitGuardian は GitHub App（Actions ミニッツ非使用）であり、課金ロック下でも PR 時に稼働継続する。

## 決定

1. `.github/workflows/` の稼働 7 本を**完全削除**する
   （`ci` `bicep` `codeql` `dependency-review` `scorecard` `semgrep` `zap-baseline`）。
   git 履歴から復元可能。
2. `.github/dependabot.yml` を削除する（監視対象は `github-actions` のみで、削除後は無意味）。
3. `.github/workflows/claude-review.yml.example` は**残す**（`.example` は稼働せず依存を作らない参照資料）。
4. ローカルゲートとして **pre-commit フレームワーク**を導入する。
5. ローカル実行手段のない旧ゲートは **semgrep 中心＋依存監査ローカル追加**で代替する。

## アーキテクチャ（local-first ゲート）

リンタ類は **pre-commit を単一の住処**とし、重複/ドリフトを避ける。
`validate-repo.sh` は「必須ファイル存在チェック ＋ bicep ＋ pre-commit 呼び出し」に整理する。

### pre-commit ステージ構成（`.pre-commit-config.yaml`）

- **commit 段階（速い・自動修正）**
  - `pre-commit-hooks`: trailing-whitespace, end-of-file-fixer, check-merge-conflict,
    check-json, check-yaml, check-added-large-files, **detect-private-key**
  - markdownlint-cli2, yamllint, shellcheck
- **pre-push 段階（重い）**
  - `make security`（semgrep + osv-scanner）
  - `make bicep`（`az` 導入時のみ）

pre-commit のリモート hook 取得は公開リポジトリの clone のみで、Actions 課金ロックの影響を受けない。

### 旧ゲートの代替

| 旧ゲート(Actions) | 代替 | 備考 |
|---|---|---|
| Semgrep | ローカル semgrep（pre-push / `run-security.sh`） | SAST の中心 |
| Dependency Review | **osv-scanner** をローカル追加 | lockfile 走査。app 未導入のため当面 no-op だが配線 |
| CodeQL | 撤退 | ローカル実行不可、semgrep で代替。tradeoff を docs/18 に明記 |
| OpenSSF Scorecard | 撤退 | GitHub ホスト前提のサプライチェーン姿勢評価 |
| OWASP ZAP | ワークフロー撤退 | 稼働環境向け手動 docker 手順を docs/18 に残す。`.zap/rules.tsv` は保持 |

秘密検知は **GitGuardian(PR App) + detect-private-key(local)** の二重化。

## 変更対象ファイル

- 追加: `.pre-commit-config.yaml`
- 削除: `.github/workflows/{ci,bicep,codeql,dependency-review,scorecard,semgrep,zap-baseline}.yml`, `.github/dependabot.yml`
- 更新スクリプト:
  - `scripts/setup-dev.sh`: pre-commit + osv-scanner 導入、`pre-commit install` / `--hook-type pre-push`
  - `scripts/run-security.sh`: semgrep + osv-scanner（存在時のみ）
  - `scripts/validate-repo.sh`: 必須ファイル＋bicep＋`pre-commit run --all-files` へ整理
  - `Makefile`: `make hooks`（`pre-commit run --all-files`）追加
- 更新ドキュメント:
  - `docs/12-security-architecture.md`（統制リストを local-first へ）
  - `docs/18-appsec-pipeline.md`（PRゲート/継続検査を pre-commit 基盤へ書き換え）
  - `README.md`（`.github/` 構成説明から Actions を除去）
  - `CONTRIBUTING.md`（開発フロー step4/6 の「CI・セキュリティゲート」→ ローカルゲート）
  - `docs/REFERENCES.md`（pre-commit, osv-scanner を追加）
  - `backlog/issues/*.md` のうち Actions ゲート前提の記述を整合

## GitHub 側の後片付け（外向き操作・実行前に対象一覧を再提示）

- PR **#1**（dependabot actions bump）: close（削除で moot）
- Issue **#20 #22 #28 #29**: Actions 前提 → local-gate 前提へ改訂 or close
- Issue **#31**（ブランチ保護の必須チェック）: 必須 = GitGuardian ＋ 人間レビューのみへ改訂
- PR #33 / #34 は無関係のため対象外（削除後リベースが必要になる点のみ通知）

## 非目標 / 受容するトレードオフ

- CodeQL 相当の深いデータフロー分析、OpenSSF Scorecard の姿勢スコアは失う（semgrep で部分代替）。
- ローカルゲートは開発者マシン依存であり、CI のような中央強制力はない（pre-commit + `make` で担保）。
- 課金ロック解除後に Actions を再導入する場合は、本 spec を revert 起点にできる。

## ロールバック

削除ファイルは git 履歴から復元可能。`.pre-commit-config.yaml` を削除し `pre-commit uninstall` すれば元の運用へ戻せる。

## 検証方法

1. `pre-commit run --all-files` が全 hook で pass する。
2. `make validate` / `make security` がローカルで pass する。
3. `git commit` / `git push` 時に pre-commit / pre-push hook が発火する（意図的に lint 違反を入れてブロックを確認）。
4. `.github/workflows/` に稼働ワークフローが無く、GitGuardian のみが PR チェックに残る。
