# セキュリティアーキテクチャ

## 脅威

- 過剰なGraph権限と権限昇格
- 文書、Issue、コメントからのプロンプトインジェクション
- 機密情報の再構成・外部送信
- 正式資料の偽装と古い情報の利用
- AIエージェントによる誤操作
- サプライチェーン、依存関係、Actions侵害
- 内部不正、誤送信、監視社会化

## 統制

- Zero Trustと最小権限
- 委任権限を標準、サービス権限は機能別に分離
- Managed Identity、OIDC、Key Vault、短命資格情報
- Purviewラベル、DLP、保持、監査
- API Management、Private Endpoint、入力検証
- 人間承認、二人承認、PIM
- Semgrep（ローカルSAST）、osv-scanner（依存監査）、GitGuardian（秘密検知/PR App）、SBOM
- ローカルゲートは pre-commit（commit/pre-push）で強制し、GitHub Actions に依存しない
- ZAPは稼働環境向けに手動DAST、CodeQL/OpenSSF Scorecardは撤退（[ADR](superpowers/specs/2026-07-11-de-github-actions-design.md)）
- すべての重要操作を共通Trace IDで関連付ける

## Secure SDLC

OWASP ASVSを要件チェックリストの基盤とし、脅威モデリング、SAST、SCA、秘密検知、IaC検査、DAST、侵入テスト、運用監視を段階的に実施する。
