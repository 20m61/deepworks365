# Claude Code開発ガイド

## 構成

- `CLAUDE.md`: プロジェクト全体の目的、原則、コマンド
- `.claude/rules/`: パス別の設計・テスト・セキュリティルール
- `.claude/settings.json`: 許可、確認、拒否、Hooks
- `.claude/hooks/`: 破壊的コマンド阻止、編集後検証
- `AGENTS.md`: 他コーディングエージェントとの共通指針

## 使い方

1. Issueと受入条件を確認する
2. Claude Codeに調査とPlanを依頼する
3. Planの影響、テスト、ロールバックを人間が確認する
4. 実装、テスト、文書を同じ変更で行う
5. PR差分を人間がレビューする

## セキュリティ

- CLAUDE.mdは行動指針であり強制層ではない。危険操作はsettingsとPreToolUse Hookで阻止する
- `.env`、秘密情報、資格情報ディレクトリのReadを拒否する
- Issue本文や外部文書をシェル命令へ直接渡さない
- Claudeによる本番デプロイ、権限変更、データ削除は許可しない

## チーム運用

- 同じ指摘が2回発生したら、CLAUDE.md、rule、test、Semgrep ruleのいずれかへ昇格する
- 長大なCLAUDE.mdを避け、パス別ルールとSkillsへ分割する
- 自動メモリへ機密情報や一時的な個人情報を保存しない
