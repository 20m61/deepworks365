---
paths:
  - "docs/**/*"
  - "infra/**/*"
  - "apps/**/*"
  - "packages/**/*"
---
# Architecture rules

- System of Record / Intelligence / Action / Governance を分離する。
- 業務状態は決定論的な永続層が管理し、会話履歴へ依存させない。
- Microsoft 365 / Entraを認証・認可の正とする。
- イベント駆動、差分処理、冪等性、再試行、補償処理を優先する。
- 外部連携はExternal Collaboration Zoneを経由させる。
- 重要な設計変更にはADRを追加する。
