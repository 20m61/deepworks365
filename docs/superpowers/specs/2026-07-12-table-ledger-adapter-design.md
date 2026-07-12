# Table Ledger Adapter 設計 (#26 継続: 暗号化・アクセス制御を備えた永続層へ移行)

## 背景と目的

`#26` の PoC 本番前提のうち「意思決定台帳の保存先を選定し、PII を平文で `/tmp` 等に保存しない
（暗号化・アクセス制御を備えた永続層へ移行する）」を解消する。現状は `jsonFileLedger` が
`LEDGER_PATH` へ append-only JSONL を書き、infra では `/home`（ストレージ裏付け・SSE暗号化）を
暫定指定し、`buildDecisionServices` は未設定なら fail-closed する（#26 マージ済）。

本設計は **Azure Table Storage** を正式な永続層とし、既存 `LedgerRepository` を実装する
3つ目のアダプタ `tableLedger` を追加、`composition` で配線、infra へ Table 資源と RBAC を
追加する縦断スライスを定義する。

## 非交渉ルールとの対応

- ルール10（秘密/PII を平文で残さない）: Table Storage は SSE 暗号化（保存時）＋ Managed
  Identity アクセス制御。`approver` は #26 で Entra oid（擬名）に束縛済。
- ルール7（追跡可能性）＋ ルール2,4（approved_decision の構造ガード）: 版・supersede 整合を
  storage 層のトランザクションで並行下でも担保。
- ルール9（冪等・再試行）: ingest の meetingId dedup（#26 サービス層、マージ済）を非回帰で維持。

## スコープ

縦断フルスライス:

1. `packages/decision/src/ledger/tableLedger.ts` — `LedgerRepository` 実装
2. オフラインテスト（fake TableClient、Azurite 非依存）＋ 3アダプタ共有の契約テスト
3. `apps/ingest-func/src/composition.ts` — `LEDGER_TABLE` 配線（fail-closed 維持）
4. infra Bicep — Table サービス/テーブル資源 ＋ Function MI へ Storage Table Data Contributor

**スコープ外（後続）**: `basis` のフィールドレベル暗号化、per-meeting マーカーによる
ingest 冪等の storage 層原子化、二次索引による `get(id)` 最適化。

> **追記（実装済み）**: Azurite への実接続統合テストは本スライスに含めた
> （`apps/ingest-func/test/azureTableClient.integration.test.ts`、`AZURITE_TABLE_TEST=1` で
> 明示実行・既定ゲートではスキップ）。shim の実 `@azure/data-tables` マッピングと ETag
> トランザクションの並行 412（rule7）を実 Azurite で検証済み。

## アーキテクチャ

### アダプタと構造ガードの共有

`tableLedger` は既存の純粋関数 `buildEntry(entries, id, input)`（`inMemoryLedger.ts`）を再利用し、
approved_decision→approval 必須 / supersedes 存在必須 / version=prev+1 を3アダプタ共通に保つ。
アダプタは `buildEntry` の外側に「読み取り→検証→書き込み（トランザクション）」層を足す。

### Table スキーマ（`@azure/data-tables`）

| 要素 | 値 |
|---|---|
| PartitionKey | `meetingId`（`getByMeeting` を単一パーティションクエリに） |
| RowKey | エントリ `id`（`led-...`、一意。`get(id)` を壊さないため supersede 用の決定的キーにはしない） |
| プロパティ | `kind` / `state` / `version`(Int32) / `owner` / `recordedAt` / `supersedes`? / `supersededBy`? / `payloadJson` / `approvalJson`? / `deliveryRefJson`? |

複合フィールド（payload / approval / deliveryRef）は JSON 文字列で格納し、読み取り時に復元する。

### メソッド写像

- `append(input)`:
  - `supersedes` 無し（初期候補）: `buildEntry` で検証 → 単純 `createEntity`（create-only）。
  - `supersedes` 有り: base エンティティを ETag 付きで読み、`buildEntry` で検証・version 計算後、
    **同一 PartitionKey のエンティティグループトランザクション**を原子実行:
    `submitTransaction([ createEntity(new), updateEntity(base, {supersededBy:newId}, "Merge", ifMatch=baseETag) ])`。
- `get(id)`: `RowKey eq id` のフィルタクエリ（PoC 規模で許容、将来は二次索引）。ヒット無しは `null`。
- `getByMeeting(meetingId)`: PartitionKey 一致クエリ。順序は保証しない（既存 `inMemory`/`jsonFile` アダプタと同じく挿入/パーティション順。現行consumer の `requireHead`・ingest dedup は順序非依存）。

### 並行性（二重承認の構造防止）

複数インスタンス並行で同一 base を supersede しようとすると、両者が base を head と読み別 id で
insert し approved_decision が2版生成されうる（サービス層 `requireHead` は read-then-write のため
並行下では保証されない）。上記トランザクションの `ifMatch=baseETag` により、後発は
**412 Precondition Failed** となり、アダプタが `entry <id> is no longer head (concurrent supersede)`
を throw する。これで「base は高々1回しか supersede されない」を storage 層で強制する（二重防御:
サービス層 `requireHead` を高速な事前チェックとして残す）。

### 配線（composition, fail-closed 維持）

`buildDecisionServices` の選択優先順位:

1. `LEDGER_TABLE`（＋ストレージ接続/資格情報）あり → `tableLedger`
2. `LEDGER_PATH` あり → `jsonFileLedger`
3. どちらも無し → **throw（fail-closed）**

`LEDGER_TABLE` 設定済でも TableClient を構築できない場合は throw（安全でない代替へ落ちない）。
認証は Managed Identity（`DefaultAzureCredential`）。ローカル/テストは Azurite 接続文字列
（`UseDevelopmentStorage=true`）または既存 `jsonFile`/`inMemory`。

### infra（Bicep）

既存ストレージアカウントに Table サービス＋テーブル資源を追加し、Function の System-Assigned MI に
**Storage Table Data Contributor**（`0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3`）ロールを付与
（既存の Blob Owner / Queue Data Contributor に追加）。`LEDGER_TABLE` を appSettings に追加し、
`LEDGER_PATH`（/home 暫定）は移行完了後に撤去する。

## テスト戦略（オフライン・Azurite 非依存）

- **fake TableClient**: `createEntity`（create-only、重複409）/ `getEntity` / `listEntities`（フィルタ）/
  `submitTransaction`（原子的バッチ）/ `updateEntity`（Merge）のみ実装。**ETag を増分し古い
  `ifMatch` を 412 で弾く**ことで並行レースを検証可能にする。
- **共有契約テスト**: アダプタ生成 factory でパラメタ化し、`inMemory` / `jsonFile` / `table` の
  3実装すべてに append/version/supersedes/getByMeeting を通す（既存アダプタ別テストから抽出）。
- **並行テスト**: 同一 base への2 supersede を fake の ETag 競合で再現し、後発が 412→throw を検証。
- **composition テスト**: `LEDGER_TABLE` 設定時に tableLedger 選択、未設定は fail-closed。
- infra は `make bicep` で構文検証。
- **fake の限界と実検証**: fake は仮定した Table セマンティクスの符号化。実 Azurite での差異検証は
  gated 統合テスト（`AZURITE_TABLE_TEST=1`）で実施済み — shim の SDK マッピングと ETag
  トランザクションの並行 412 を実 storage で実証する（fake だけによる誤った安心を避ける）。

## エラー処理

| Table 応答 | アダプタ挙動 |
|---|---|
| `getEntity` 404 | `get()` は `null` |
| `submitTransaction` 412 | `... is no longer head (concurrent supersede)` を throw → approve ハンドラが 409 |
| `createEntity` 409 | 一意id想定のため異常として surface |
| 429/503 | `@azure/data-tables` 組込みリトライへ委譲（独自リトライ追加せず） |

approve ハンドラの `catch` は `not found` を含むメッセージのみ 404、競合系は 409。文言を統一する。

## 可観測性 / PII

- アダプタは**エラー経路のみ**ログし、`approver`/`basis`/エンティティ内容は**ログしない**（ルール10）。
- `@azure/data-tables` の spans は既存 OTel（`telemetry.ts`）連携時に自動計上される。

## 依存追加

- `@azure/data-tables`（＋認証は既存 `@azure/identity` 系）。サプライチェーンゲート
  （semgrep `package_managers.*` は #25 で暫定除外中、osv-scanner は有効）の対象になる点を注記。

## 検証（DoD）

1. `pnpm -r typecheck` / `pnpm -r test`（共有契約＋並行＋composition の新規テスト含む）pass。
2. `make security`（semgrep 0 / osv 0）/ `make validate` / `make bicep` pass。
3. 契約テストで tableLedger が `LedgerRepository` に適合、並行テストで二重承認が構造的に不可能。
4. 実 Azure / Azurite への接続・デプロイは本スライス対象外（fail-closed とテストで境界を担保）。
