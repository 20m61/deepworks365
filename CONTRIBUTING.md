# Contributing

## 基本方針

- Issueで課題、期待する成果、受入条件を明確にしてから変更する
- 小さく、レビュー可能で、取り消し可能な変更を優先する
- 重要な設計判断はADRとして記録する
- AI生成コードも人間が責任を持ってレビューする
- セキュリティ、プライバシー、アクセシビリティを完了条件に含める

## 開発フロー

1. Issueを選び、必要なら設計コメントを追加する
2. ブランチを作成する: `feat/<issue>-short-name`
3. テストとドキュメントを同時に更新する
4. `make validate` と `make security` を実行する（pre-commit / pre-push フックでも自動実行される）
5. Draft PRを作成し、差分・リスク・検証結果を記載する
6. ローカルゲート（pre-commit）、GitGuardian、人間レビューを通す
7. 段階リリースと観測計画を確認する

## ブランチ保護とローカルゲート

- `main` は Ruleset `main-protection` で保護される（PR 必須 / 必須チェック=GitGuardian /
  force push・削除禁止 / 管理者は緊急時のみ bypass）。詳細と緊急手順は
  [ブランチ保護とローカルゲート運用](docs/19-branch-protection.md) を参照。
- push 時に pre-push ゲート（build / typecheck / test / Semgrep / osv-scanner / bicep）が
  自動実行される。`--no-verify` での回避は禁止（`guard-destructive.sh` がブロックする）。
- 初回導入は `./scripts/setup-dev.sh`、全 hook 実行は `make hooks`。

## Definition of Done

- 受入条件を満たす
- テストが追加・更新されている
- 権限、データ、外部通信への影響を確認済み
- ログ・メトリック・トレースが必要十分
- コスト影響が評価されている
- 利用者向け・運用者向けドキュメントが更新されている
- ロールバックまたは機能停止方法が定義されている
