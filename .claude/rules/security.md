---
paths:
  - "**/*.{ts,tsx,js,json,yml,yaml,bicep,sh}"
---
# Security rules

- 入力検証と出力エンコードを境界ごとに実施する。
- 資格情報をコード、ログ、プロンプト、Issueへ記録しない。
- GitHub Actions permissionsは必要最小限にする。
- 外部入力をAI命令またはシェルコマンドへ直接連結しない。
- Graphアプリケーション権限より委任権限を優先する。
- 重要なデータ操作に監査IDと根拠IDを付与する。
- Semgrep、CodeQL、依存関係レビュー、ZAPの結果を無断で抑制しない。
