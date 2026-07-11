# PoC #25 Meeting→Decision→Delivery（B フェーズ）設計 spec

- 日付: 2026-07-11
- ステータス: 承認済み（実装前）
- 位置づけ: 段階計画 C の B フェーズ。A フェーズ（Platform Skeleton）の上に構築。
- 関連 Issue: #25（PoC 縦断検証）, #8（会議から合意/未決/タスク候補抽出）, #7（意思決定台帳）, #11/#12（Decision&Review）
- 依存: 骨組み（`@oip/core`, `apps/ingest-func`）。本作業は PR #35 の上に stacked。

## 目的

会議 transcript から「合意候補・未決事項・タスク候補」を抽出し、意思決定台帳へ根拠付きで記録し、
人間の承認を経て正式決定（`approved_decision`）と配信候補に変換する**縦断ドメイン核**を、
**本環境でオフライン TDD 検証可能**な形で実装する。実 Teams/Graph/LLM/Planner/Azure には到達せず、
それらは ports の背後に置き、テストは決定論 fake、実 adapter は IF 定義/スタブに留める。

## 非交渉ルールの反映

- AI は候補（`ai_inferred`/`hypothesis`）を作るのみ。**正式決定はしない**（ルール2）。
- `approved_decision` は人間の `ApprovalService` 経由でのみ生成（ルール4）。AI 経路では生成不可能に設計。
- 推定/仮説/事実/決定をデータ上で分離（ルール6）。
- 全エントリに根拠(basis=原本発言参照)・バージョン・所有者・時刻を持たせ追跡可能に（ルール7）。
- 未信頼 transcript を命令として実行しない（ルール3）。抽出は分類のみ、副作用を持たない。

## アーキテクチャ: `@oip/decision`（ports & adapters）

`@oip/core` に依存。以下を含む。

### ドメイン型

- `InformationState = 'ai_inferred' | 'hypothesis' | 'human_reported' | 'confirmed_fact' | 'approved_decision' | 'unverified' | 'conflicted'`
  （docs/04 の情報状態の PoC 部分集合）
- `SourceRef { meetingId: string; utteranceId: string; speaker?: string; text: string }`（原本=発言参照）
- 候補（issue #8）:
  - `AgreementCandidate { id; kind: 'agreement'; text; basis: SourceRef[]; state; meetingId; confidence? }`
  - `OpenIssue { id; kind: 'issue'; text; basis; state; meetingId }`
  - `TaskCandidate { id; kind: 'task'; text; assigneeHint?; dueHint?; basis; state; meetingId }`
- `Transcript { meetingId; title?; utterances: { id; speaker; text }[] }`
- 台帳エントリ: `LedgerEntry { id; meetingId; kind; state; payload; basis; version; owner; recordedAt; supersedes? }`
- 決定: `Decision`（`approved_decision` 状態のエントリ）に承認メタ `{ approver; approvedAt; basis; conditions? }`

### ports

- `ExtractPort { extract(t: Transcript): Promise<ExtractionResult> }`
  - `ExtractionResult { agreements: AgreementCandidate[]; issues: OpenIssue[]; tasks: TaskCandidate[] }`
  - **fake（テスト/PoC 既定）**: 決定論マーカー抽出（`決定:`/`合意:` → agreement, `TODO:`/`タスク:` → task, 末尾 `?` や `未決:` → issue）。各候補に basis=元 utterance を付与、state=`ai_inferred`。
  - 実 adapter（Foundry/Azure OpenAI）: IF 定義のみ、スタブ（本env 実行不可）。
- `LedgerRepository { append(e): Promise<LedgerEntry>; get(id): Promise<LedgerEntry|null>; getByMeeting(id): Promise<LedgerEntry[]> }`
  - in-memory fake（テスト）＋ JSON 追記ファイル adapter（append-only、version 採番、`supersedes` で版連結）。
- `DeliveryPort { deliver(task: TaskCandidate): Promise<DeliveryRef> }`
  - fake（記録のみ）＋ Planner adapter スタブ。

### services

- `IngestMeetingService(extract: ExtractPort, ledger: LedgerRepository)`
  - `ingest(t: Transcript)`: 抽出 → 各候補を state=`ai_inferred` で台帳 append（basis/version 付き）。決定はしない。抽出結果サマリを返す。
- `ApprovalService(ledger: LedgerRepository, delivery: DeliveryPort)`
  - `approve(entryId, { approver, basis, conditions? })`: 対象候補の新版を `approved_decision`（agreement）/ 承認済みタスクとして append（`supersedes` 連結、承認メタ記録）。**AI 経路からは呼べない**（承認者必須・サービス境界）。
  - `approveWithConditions` / `reject`(差戻し→ state 据置＋理由記録) / `requestMoreInfo`(追加調査→ `unverified` 補足)。
  - 承認済み TaskCandidate → `DeliveryPort.deliver`（配信参照を台帳に記録）。
- `ReviewPacket` builder: 候補＋台帳履歴から docs/08 の三層データを組立
  - 30秒: 判断事項/主要変化/推奨/期限
  - 3分: 背景/選択肢/リスク/異論/不確実性
  - 原本: basis(SourceRef) のハイライト対象
  - `operations: ['approve','approveWithConditions','reject','requestMoreInfo']`
  - UI は非対象（データ構造のみ）。

## `apps/ingest-func` への薄い配線

- `onEvent`（Service Bus `meeting.ended`）: payload の transcript 参照 → `IngestMeetingService.ingest`（fake extractor ＋ JSON 台帳 adapter）。ハンドラは純粋 delegator。
- 新 HTTP 関数 `decisions`: `POST /api/decisions/{id}/approve`（body: approver/basis）→ `ApprovalService.approve`。delegator。
- 依存は index.ts で組立（fake/adapter を注入）。実 Foundry/Planner adapter はスタブのまま。

## テスト戦略（TDD）

- 抽出 fake: fixture transcript → 期待候補（種別/basis/state）を検証。
- 台帳: in-memory + JSON adapter の append/version/supersedes/getByMeeting。
- `IngestMeetingService`: 抽出→台帳追記、state=`ai_inferred`、決定を作らないこと。
- `ApprovalService`: approve→`approved_decision` 新版＋承認メタ＋traceability。reject/conditions/moreInfo。**境界: AI/サービス外から `approved_decision` を作れないこと**。承認タスク→delivery 記録。
- `ReviewPacket`: 三層データと operations の組立。
- 統合: transcript → ingest → review → approve → decision（＋task delivery）を in-memory で end-to-end。
- ハンドラ delegator は純粋関数として検証（Functions ランタイム非依存）。

## 検証方法（DoD）

1. `pnpm -r typecheck` / `pnpm -r test`（新規テスト含む）pass。
2. `make security`（semgrep 0 / osv 0）/ `make validate` / `make bicep` pass（既存ゲート維持）。
3. 統合テストで「AI は候補まで、決定は人間承認経由」の境界が実証される。
4. 実クラウド/M365/LLM への接続・デプロイは対象外。

## 非目標

- 実 Graph/Teams 取込、実 LLM 抽出、実 Planner 配信、UI レンダリング、認証フロー。
- 経営判断キュー/ダッシュボード（#10/#11 の広い UX）、組織文脈グラフ（#5）。
- 本番運用のスケール/コスト/監視作り込み。

## ロールバック

新規追加中心（`packages/decision` と `apps/ingest-func` の薄い配線）。パッケージ削除で戻せる。

## 次ステップ

本 spec 承認後 writing-plans で TDD 実装計画へ。実装は #35 の上の `feat/decision-poc` で進める。
