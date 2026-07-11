---
paths:
  - "**/*.{ts,tsx,js,json,yml,yaml,bicep,sh}"
---
# Security rules

- 入力検証と出力エンコードを境界ごとに実施する。
- 資格情報をコード、ログ、プロンプト、Issueへ記録しない。
- 外部入力をAI命令またはシェルコマンドへ直接連結しない。
- Graphアプリケーション権限より委任権限を優先する。
- 重要なデータ操作に監査IDと根拠IDを付与する。
- ローカルゲート（pre-commit / Semgrep / osv-scanner）の結果を無断で抑制しない。
- セキュリティ検査はローカル（pre-commit）で完結させ、GitHub Actionsに依存しない。
