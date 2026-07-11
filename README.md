# Organizational Intelligence Platform

Microsoft 365 / Entra ID / Azure を中核として、人間の対話・合意・価値探索から、精度の高い意思決定、成果物、タスク、組織学習を連続的に生み出すためのオープンな設計・実装プロジェクトです。

> 作業摩擦を限りなく減らしながら、問い・対話・異論・価値探索は増やす。

## 目指す状態

- 社員は理想、顧客価値、仮説、異論を語り合うことに集中する
- システムは情報収集、文脈復元、構造化、検証、成果物生成、実行追跡を担う
- Microsoft 365 / Entra ID の既存権限を唯一のアクセス制御基盤とする
- 固定ロジック、AI、人間承認の境界を明確にする
- 経営層は判断に必要な情報を30秒・3分・原本の三層で確認できる
- プロジェクトの状態だけでなく、背景、変化、影響、予兆を統合的に把握する
- 組織の基準、意思決定、暗黙知を実務から継続的に育てる
- システム自身も少人数で安全・低コストに開発、運用、改善できる

## ドキュメント

| 文書 | 内容 |
|---|---|
| [プロジェクト憲章](docs/01-project-charter.md) | 目的、原則、範囲、成功条件、ガバナンス |
| [プロダクトビジョン](docs/02-product-vision.md) | 利用体験、価値、非目標 |
| [全体アーキテクチャ](docs/03-architecture.md) | 4層構造、M365/Azure連携、AI境界 |
| [ドメインモデル](docs/04-domain-model.md) | 戦略、案件、判断、タスク、成果、基準 |
| [Microsoft 365統合](docs/05-m365-integration.md) | Teams、Outlook、Graph、Entra、Purview |
| [AI・人間協調設計](docs/06-ai-human-boundaries.md) | 決定論、AI推論、人間承認 |
| [組織文脈と基準育成](docs/07-context-and-standards.md) | 時系列、正本、暗黙知、Living Standards |
| [判断・レビュー体験](docs/08-decision-review-experience.md) | 可視化、差分、原本ハイライト |
| [プロジェクトヘルス](docs/09-project-health.md) | 多次元ヘルス、予兆、ステークホルダービュー |
| [専門職エージェント](docs/10-professional-agents.md) | アナリスト、秘書、メンター等 |
| [開発・運用統制基盤](docs/11-developer-operations-control-plane.md) | DevEx、CI/CD、監視、FinOps |
| [セキュリティ](docs/12-security-architecture.md) | Zero Trust、AppSec、AI安全性 |
| [ROI・コスト](docs/13-roi-finops.md) | 8,000人想定の投資対効果 |
| [リスク登録簿](docs/14-risk-register.md) | 人間・組織・技術・運用リスク |
| [ロードマップ](docs/15-roadmap.md) | PoCから全社展開まで |
| [GitHub Project設計](docs/16-github-project.md) | フィールド、ビュー、運用ルール |
| [Claude Code開発ガイド](docs/17-claude-code-development.md) | CLAUDE.md、ルール、Hooks、権限制御 |
| [AppSecパイプライン](docs/18-appsec-pipeline.md) | pre-commit、Semgrep、osv-scanner、GitGuardian |

## リポジトリ構造

```text
.
├── .claude/                 # Claude Code設定・ルール・Hooks
├── .github/                 # Issue/PRテンプレート、CODEOWNERS
├── .pre-commit-config.yaml  # ローカルゲート (GitHub Actions非依存)
├── backlog/issues/          # 初期Issue定義
├── docs/                    # 構想・設計・運用ドキュメント
├── infra/                   # Bicep / Azure Developer CLI基盤
├── scripts/                 # GitHub初期化・検証・セキュリティ実行
├── CLAUDE.md                # Claude Codeのプロジェクト指示
├── SECURITY.md
└── azure.yaml
```

## GitHubへ公開する

GitHub CLIが認証済みの端末で実行します。

```bash
./scripts/bootstrap-github.sh
```

このスクリプトは、公開リポジトリ、ラベル、GitHub Project、初期Issueを作成します。既存リポジトリへ投入する場合は環境変数を指定します。

```bash
GITHUB_OWNER=20m61 \
GITHUB_REPO=deepworks365 \
./scripts/bootstrap-github.sh
```

## 開発開始

```bash
./scripts/setup-dev.sh
make validate
make security
```

Claude Codeでは、リポジトリ直下で `claude` を起動してください。プロジェクトの設計原則と安全制約は `CLAUDE.md` と `.claude/rules/` から読み込まれます。

## ライセンス

Apache License 2.0
