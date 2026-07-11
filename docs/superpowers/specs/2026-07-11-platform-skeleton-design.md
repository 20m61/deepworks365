# Platform Skeleton（A フェーズ）設計 spec

- 日付: 2026-07-11
- ステータス: 承認済み（実装前）
- 位置づけ: 段階計画 C の A フェーズ（骨組み）。B フェーズは PoC #25（Meeting→Decision→Delivery 縦断）。
- 関連 Issue: #18（azd golden path）, #23（可観測性）, #25（次フェーズ）
- 依存: 本作業はローカルゲート PR #35 の上に stacked。#35 マージ後に main へリベース。

## 目的

巨大な多サブシステム構想（charter/architecture）を一気に作らず、まず **デプロイ可能な最小の
プラットフォーム基盤（golden path）** を確立する。技術スタック・リポジトリ構造・可観測性・IaC・
AI/人間境界の型表現を固定し、以降の縦断スライス（B フェーズ）が乗る土台を作る。

## 確定事項（brainstorming の結論）

- コンピュート中核: **Azure Functions（Flex Consumption）**
- 言語: **TypeScript**（Functions v4 プログラミングモデル, **Node 20**）
- モノレポ: **pnpm workspaces**（corepack、setup-dev.sh で有効化済み）
- 深さ: **コード＋IaC（azd でデプロイ可能）**
- Service Bus を骨組みに含める（イベント駆動の形を最初から示す）

## リポジトリ構成

```text
pnpm-workspace.yaml
package.json            # root: pnpm, scripts(build/test/typecheck), packageManager pin
tsconfig.base.json
apps/
  ingest-func/          # Azure Functions アプリ (Flex Consumption)
    host.json
    package.json        # @azure/functions v4, node 20
    tsconfig.json
    src/
      index.ts          # 関数登録エントリ
      functions/
        health.ts       # HTTP GET /api/health … Fast Path 例（AI非依存の決定論処理）
        onEvent.ts      # Service Bus キュートリガ雛形 … イベント処理の形
      observability/
        telemetry.ts    # OpenTelemetry + Azure Monitor(App Insights) 初期化
      config/
        env.ts          # 型付き設定ローダ（接続文字列/キュー名等）
    test/
      health.test.ts
      onEvent.test.ts
packages/
  core/                 # 共通ドメイン
    package.json
    tsconfig.json
    src/
      index.ts
      boundaries.ts     # 実行レベル L0..L5（docs/06 を型で表現）
      result.ts         # 推定/仮説/事実/正式決定 を分離する型（非交渉ルール6）
    test/
      boundaries.test.ts
```

## コンポーネント設計

### apps/ingest-func

- **health.ts**: HTTP トリガ。`{ status: 'ok', version, commit }` を返す。AI を呼ばない Fast Path の代表例。
  スモークテスト・死活監視の起点。
- **onEvent.ts**: Service Bus キュートリガの雛形。受信メッセージを検証してログ/Trace に載せるだけの
  プレースホルダ（業務ロジックは B フェーズ）。イベント駆動・冪等・Trace 付与の“形”を提示する。
- **observability/telemetry.ts**: OpenTelemetry を初期化し Azure Monitor へエクスポート。接続文字列は
  環境変数（App Insights）から取得。charter「可観測性を初日から」。
- **config/env.ts**: 環境変数を型付きで読む単一の入口。秘密は値をコードに置かず参照のみ（ルール10）。

各ユニットは「何をするか・どう使うか・何に依存するか」が単独で説明でき、ハンドラは純粋関数として
テスト可能に切り出す（Functions ランタイム非依存でユニットテスト）。

### packages/core

- **boundaries.ts**: `ExecutionLevel`（L0 検索/要約 … L5 権限変更/人事＝人間のみ）を列挙・型化。
  各操作がどのレベルかをコードで表明できるようにする（docs/06）。
- **result.ts**: `Fact` / `Hypothesis` / `Estimate` / `Decision` を判別可能ユニオンで分離（ルール6）。
  「AI の推奨」と「正式な決定」を型レベルで混同させない。

## IaC（infra/ 拡張）

- `main.bicep`（subscription スコープ, RG 作成は現状維持）→ `modules/functions.bicep`（RG スコープ）を呼ぶ。
- `modules/functions.bicep` が provision するもの:
  - Storage Account（Functions 必須, デプロイ/コンテンツ）
  - Log Analytics Workspace + Application Insights
  - Flex Consumption プラン（`Microsoft.Web/serverfarms`, FC1）+ Function App（`Microsoft.Web/sites`, flex, node 20）
  - **Managed Identity**（system-assigned）と RBAC: Storage Blob Data Owner（デプロイ storage）、Monitoring Metrics Publisher
  - Service Bus 名前空間 + キュー（`onEvent` 用）と、Function App への Data Receiver ロール割当
  - app settings: `APPLICATIONINSIGHTS_CONNECTION_STRING`、Service Bus は identity ベース接続で配線（秘密文字列を避ける）
- `main.parameters.json` を必要パラメータで更新。
- `azure.yaml` に services を追加:

  ```yaml
  services:
    ingest-func:
      project: apps/ingest-func
      language: ts
      host: function
  ```

## ローカルゲート拡張（PR #35 の gate を継承）

- ルート `package.json` に scripts: `build`(tsc -b), `typecheck`(tsc --noEmit), `test`(vitest run)。
- `Makefile` に `test` / `typecheck` ターゲット追加。
- pre-push フックに `pnpm -r typecheck` と `pnpm -r test` を追加（重いので commit 段階ではなく pre-push）。
- `bicep build` は既存ゲートで担保。
- eslint は本スコープ外（型は tsc で担保）。後続で追加を Issue 化。

## テスト戦略（TDD）

- ハンドラのドメインロジックを純粋関数に切り出し、vitest で先にテストを書く。
  - `health`: 返却スキーマ（status/version/commit）の検証。
  - `onEvent`: メッセージ検証・不正入力の扱い（未信頼入力を命令化しない=ルール3の下地）。
  - `core/boundaries`: レベル判定・型の網羅性。
- Functions ランタイム/Azure への接続はテストしない（ユニットは分離）。

## 検証方法（DoD）

1. `pnpm install` 成功。
2. `pnpm -r typecheck` / `pnpm -r test` が pass。
3. `bicep build infra/main.bicep` が pass（既存ゲート）、`azure.yaml` 妥当。
4. pre-push フックで typecheck/test/security/bicep が発火し pass。
5. **azd 実デプロイは検証対象外**（Azure 認証＋コスト＝③(c) 相当。別途承認時に実施）。
6. Functions ローカル実起動（Azure Functions Core Tools）は任意（重いため必須にしない）。

## 非目標

- 業務ロジック（合意/未決/タスク候補抽出、意思決定台帳）＝ B フェーズ（PoC #25）。
- 認証フロー実体、Graph webhook 購読の実装、ダッシュボード、専門職エージェント、外部連携ゾーン。
- 実デプロイ・本番運用設定（スケール/アラート/コスト配賦の作り込み）。

## ロールバック

新規追加中心（apps/ packages/ と infra/modules）。骨組みごと削除すれば元へ戻せる。
infra 変更は azd 未適用なら副作用なし。

## 次ステップ

本 spec 承認後、writing-plans で実装計画（TDD 手順・タスク分割）に落とす。
実装は #35 マージ→リベース後、または stacked ブランチ上で進める。
