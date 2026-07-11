# Table Ledger Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Azure Table Storage を意思決定台帳の正式な永続層とする `LedgerRepository` アダプタを追加し、composition と infra へ配線する（#26 の「暗号化・アクセス制御を備えた永続層へ移行」を完結）。

**Architecture:** 既存の純粋関数 `buildEntry` を再利用する3つ目のアダプタ `createTableLedger` を追加する。アダプタは storage SDK に直接依存せず、最小インターフェース `TableClientLike`（テストは fake、本番は app 側の薄い shim が実 `@azure/data-tables` を包む）を受け取る。二重承認は同一 PartitionKey のエンティティグループトランザクション + ETag 楽観ロックで storage 層に構造防止する。

**Tech Stack:** TypeScript (ESM, Node ≥20), pnpm workspace, vitest, Azure Table Storage (`@azure/data-tables`), Managed Identity (`@azure/identity`), Bicep。

## Global Constraints

- ESM: すべての相対 import は `.js` 拡張子付き（例: `../ports.js`）。
- `packages/decision` に**新しいランタイム依存を追加しない**。アダプタは注入された `TableClientLike` のみ使用。`@azure/*` は `apps/ingest-func` のみに追加。
- fail-closed: `LEDGER_TABLE` も `LEDGER_PATH` も無ければ `buildDecisionServices` は throw。
- PII（`approver` / `basis` / エンティティ内容）を**ログしない**（非交渉ルール10）。
- 構造ガード（approved_decision→approval必須 / supersedes存在必須 / version=prev+1）は既存 `buildEntry` を唯一の実装として共有する。DRY。
- 二重承認防止は storage 層 ETag トランザクションで担保（非交渉ルール7）。
- ローカルゲート: `make validate` / `make security`（semgrep 0 / osv 0）/ `make bicep` / `pnpm -r test` を通す。`--no-verify` 禁止。
- 各タスク末尾で署名コミット: `git -c gpg.ssh.program=ssh-keygen commit`（このマシンの署名経路の都合。ssh-agent に鍵が載っている前提）。

---

## File Structure

- `packages/decision/test/support/ledgerContract.ts` — Create: 3アダプタ共有の契約テストスイート
- `packages/decision/test/support/fakeTableClient.ts` — Create: テスト用インメモリ `TableClientLike`（ETag/409/412/beforeSubmit）
- `packages/decision/src/ledger/tableLedger.ts` — Create: `TableClientLike` 型 + `createTableLedger`
- `packages/decision/src/index.ts` — Modify: `createTableLedger` と型を再エクスポート
- `packages/decision/test/inMemoryLedger.test.ts` — Modify: 共有契約を呼ぶ
- `packages/decision/test/jsonFileLedger.test.ts` — Modify: 共有契約 + 永続テスト
- `packages/decision/test/tableLedger.test.ts` — Create: 共有契約 + 並行テスト
- `apps/ingest-func/src/ledger/azureTableClient.ts` — Create: 実 `@azure/data-tables` を `TableClientLike` に包む shim
- `apps/ingest-func/src/composition.ts` — Modify: `resolveLedgerKind` + `LEDGER_TABLE` 配線
- `apps/ingest-func/test/composition.test.ts` — Modify: 選択ロジックのテスト
- `apps/ingest-func/package.json` — Modify: `@azure/data-tables` / `@azure/identity` 追加
- `infra/modules/functions.bicep` — Modify: Table 資源 + Storage Table Data Contributor + appSettings

---

## Task 1: 共有 Ledger 契約テストの抽出

既存 `inMemoryLedger` / `jsonFileLedger` テストの共通アサーションを、アダプタ生成 factory でパラメタ化した1スイートに集約する。振る舞いは不変（リファクタ）。

**Files:**

- Create: `packages/decision/test/support/ledgerContract.ts`
- Modify: `packages/decision/test/inMemoryLedger.test.ts`
- Modify: `packages/decision/test/jsonFileLedger.test.ts`

**Interfaces:**

- Produces: `runLedgerContract(name: string, makeLedger: () => LedgerRepository): void` — `describe` ブロックを内部生成する。

- [ ] **Step 1: 共有契約モジュールを作成**

`packages/decision/test/support/ledgerContract.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import type { LedgerRepository, AppendInput } from '../../src/ports.js';

function counter() { let n = 0; return () => `e${++n}`; }

const base: AppendInput = {
  meetingId: 'm1', kind: 'agreement', state: 'ai_inferred',
  payload: { id: 'a1', kind: 'agreement', meetingId: 'm1', text: 'X', basis: [], state: 'ai_inferred' },
  owner: 'system', recordedAt: '2026-07-11T00:00:00.000Z',
};

// counter() を各アダプタへ渡せるよう、makeLedger は idgen を内包する形で受け取る。
export function runLedgerContract(name: string, makeLedger: () => LedgerRepository): void {
  describe(`${name} (LedgerRepository 契約)`, () => {
    it('append は version=1 を採番し get で取れる', async () => {
      const led = makeLedger();
      const e = await led.append({ ...base });
      expect(e.version).toBe(1);
      expect(await led.get(e.id)).toEqual(e);
    });
    it('supersedes で version が繰り上がる', async () => {
      const led = makeLedger();
      const v1 = await led.append({ ...base });
      const v2 = await led.append({
        ...base, state: 'approved_decision', supersedes: v1.id,
        approval: { approver: 'a', approvedAt: '2026-07-11T00:00:00.000Z', basis: 'x' },
      });
      expect(v2.version).toBe(2);
      expect(v2.supersedes).toBe(v1.id);
    });
    it('getByMeeting は当該会議の全 entry を返す', async () => {
      const led = makeLedger();
      await led.append({ ...base });
      await led.append({ ...base, meetingId: 'm2' });
      expect((await led.getByMeeting('m1')).length).toBe(1);
    });
    it('approved_decision は approval 無しでは拒否 (rule2,4)', async () => {
      const led = makeLedger();
      await expect(led.append({ ...base, state: 'approved_decision' })).rejects.toThrow();
    });
    it('存在しない supersedes は拒否 (lineage)', async () => {
      const led = makeLedger();
      await expect(led.append({ ...base, supersedes: 'nope' })).rejects.toThrow();
    });
  });
}

export { counter };
```

- [ ] **Step 2: inMemory テストを契約呼び出しへ置換**

`packages/decision/test/inMemoryLedger.test.ts` を全置換:

```typescript
import { createInMemoryLedger } from '../src/ledger/inMemoryLedger.js';
import { runLedgerContract, counter } from './support/ledgerContract.js';

runLedgerContract('inMemoryLedger', () => createInMemoryLedger(counter()));
```

- [ ] **Step 3: 契約が inMemory で緑になることを確認**

Run: `pnpm --filter @oip/decision test -- inMemoryLedger`
Expected: PASS（5 tests）

- [ ] **Step 4: jsonFile テストを契約 + 永続テストへ置換**

`packages/decision/test/jsonFileLedger.test.ts` を全置換:

```typescript
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonFileLedger } from '../src/ledger/jsonFileLedger.js';
import type { AppendInput } from '../src/index.js';
import { runLedgerContract, counter } from './support/ledgerContract.js';

runLedgerContract('jsonFileLedger', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'ledger-')), 'ledger.jsonl');
  return createJsonFileLedger(file, counter());
});

const base: AppendInput = {
  meetingId: 'm1', kind: 'agreement', state: 'ai_inferred',
  payload: { id: 'a1', kind: 'agreement', meetingId: 'm1', text: 'X', basis: [], state: 'ai_inferred' },
  owner: 'system', recordedAt: '2026-07-11T00:00:00.000Z',
};

describe('jsonFileLedger 永続', () => {
  it('追記して別インスタンスから再読込できる (append-only JSONL)', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'ledger-')), 'ledger.jsonl');
    let n = 0; const idgen = () => `e${++n}`;
    const led = createJsonFileLedger(file, idgen);
    const e = await led.append({ ...base });
    expect(readFileSync(file, 'utf8').trim().split('\n').length).toBe(1);
    let m = 0; const idgen2 = () => `f${++m}`;
    const led2 = createJsonFileLedger(file, idgen2);
    expect(await led2.get(e.id)).toEqual(e);
  });
});
```

- [ ] **Step 5: decision パッケージ全テスト緑を確認**

Run: `pnpm --filter @oip/decision test`
Expected: PASS（既存 23 と同数、内訳のみ変化）

- [ ] **Step 6: コミット**

```bash
git add packages/decision/test
git -c gpg.ssh.program=ssh-keygen commit -m "test(decision): Ledger契約テストを共有スイートへ抽出"
```

---

## Task 2: TableClientLike 型 と fake TableClient

アダプタが依存する最小インターフェースを定義し、テスト用 fake（ETag/409/412 + `beforeSubmit` 並行フック）を実装する。

**Files:**

- Create: `packages/decision/src/ledger/tableLedger.ts`（この時点では型のみ）
- Create: `packages/decision/test/support/fakeTableClient.ts`
- Create: `packages/decision/test/support/fakeTableClient.test.ts`

**Interfaces:**

- Produces: `LedgerTableEntity`, `TxAction`, `TableClientLike`（tableLedger.ts）
- Produces: `createFakeTableClient(): FakeTableClient`（`beforeSubmit?: () => Promise<void>` を持つ）

- [ ] **Step 1: 型定義を作成**

`packages/decision/src/ledger/tableLedger.ts`（型のみ、実装は Task 3 で追記）:

```typescript
// Table Storage の1エンティティ。複合フィールドは JSON 文字列で格納する。
export interface LedgerTableEntity {
  partitionKey: string;   // = meetingId
  rowKey: string;         // = entry id
  kind: string;
  state: string;
  version: number;
  owner: string;
  recordedAt: string;
  supersedes?: string;
  supersededBy?: string;
  payloadJson: string;
  approvalJson?: string;
  deliveryRefJson?: string;
  etag?: string;          // 楽観ロック用
}

export type TxAction =
  | { op: 'create'; entity: LedgerTableEntity }
  | { op: 'update'; entity: LedgerTableEntity; etag: string };

// アダプタが必要とする Table 操作の最小集合。本番は app 側 shim が実 SDK を包む。
export interface TableClientLike {
  createEntity(entity: LedgerTableEntity): Promise<void>;                 // 既存なら statusCode 409 を throw
  getEntity(partitionKey: string, rowKey: string): Promise<LedgerTableEntity | null>; // 無ければ null
  findByRowKey(rowKey: string): Promise<LedgerTableEntity | null>;        // 横断 RowKey 検索（get(id) 用）
  listByPartition(partitionKey: string): Promise<LedgerTableEntity[]>;
  submitTransaction(actions: TxAction[]): Promise<void>;                  // update の etag 不一致で statusCode 412 を throw
}
```

- [ ] **Step 2: fake TableClient を作成**

`packages/decision/test/support/fakeTableClient.ts`:

```typescript
import type { LedgerTableEntity, TableClientLike } from '../../src/ledger/tableLedger.js';

export interface FakeTableClient extends TableClientLike {
  // submitTransaction 実行直前に1回だけ差し込む並行競合シミュレーション用フック。
  beforeSubmit?: () => Promise<void>;
}

export function createFakeTableClient(): FakeTableClient {
  const store = new Map<string, LedgerTableEntity>();
  let etagSeq = 0;
  const key = (pk: string, rk: string) => `${pk}|${rk}`;
  const nextEtag = () => `W/"${++etagSeq}"`;

  const fake: FakeTableClient = {
    async createEntity(entity) {
      const k = key(entity.partitionKey, entity.rowKey);
      if (store.has(k)) throw Object.assign(new Error('entity exists'), { statusCode: 409 });
      store.set(k, { ...entity, etag: nextEtag() });
    },
    async getEntity(pk, rk) {
      const e = store.get(key(pk, rk));
      return e ? { ...e } : null;
    },
    async findByRowKey(rk) {
      for (const e of store.values()) if (e.rowKey === rk) return { ...e };
      return null;
    },
    async listByPartition(pk) {
      return [...store.values()].filter((e) => e.partitionKey === pk).map((e) => ({ ...e }));
    },
    async submitTransaction(actions) {
      if (fake.beforeSubmit) await fake.beforeSubmit();
      // 事前検証（原子性）: etag 不一致 / 重複 create を先に弾く。
      for (const a of actions) {
        const k = key(a.entity.partitionKey, a.entity.rowKey);
        if (a.op === 'update') {
          const cur = store.get(k);
          if (!cur || cur.etag !== a.etag) throw Object.assign(new Error('precondition failed'), { statusCode: 412 });
        }
        if (a.op === 'create' && store.has(k)) throw Object.assign(new Error('entity exists'), { statusCode: 409 });
      }
      for (const a of actions) {
        const k = key(a.entity.partitionKey, a.entity.rowKey);
        if (a.op === 'create') store.set(k, { ...a.entity, etag: nextEtag() });
        else store.set(k, { ...store.get(k)!, ...a.entity, etag: nextEtag() });
      }
    },
  };
  return fake;
}
```

- [ ] **Step 3: fake の意味論テストを書く（失敗する）**

`packages/decision/test/support/fakeTableClient.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { createFakeTableClient } from './fakeTableClient.js';
import type { LedgerTableEntity } from '../../src/ledger/tableLedger.js';

const ent = (pk: string, rk: string): LedgerTableEntity => ({
  partitionKey: pk, rowKey: rk, kind: 'agreement', state: 'ai_inferred',
  version: 1, owner: 'system', recordedAt: 't', payloadJson: '{}',
});

describe('fakeTableClient', () => {
  it('createEntity 重複は 409', async () => {
    const c = createFakeTableClient();
    await c.createEntity(ent('m1', 'r1'));
    await expect(c.createEntity(ent('m1', 'r1'))).rejects.toMatchObject({ statusCode: 409 });
  });
  it('submitTransaction は古い etag で 412', async () => {
    const c = createFakeTableClient();
    await c.createEntity(ent('m1', 'base'));
    await expect(c.submitTransaction([
      { op: 'update', entity: ent('m1', 'base'), etag: 'W/"stale"' },
    ])).rejects.toMatchObject({ statusCode: 412 });
  });
  it('submitTransaction は正しい etag で成功し etag を進める', async () => {
    const c = createFakeTableClient();
    await c.createEntity(ent('m1', 'base'));
    const cur = await c.getEntity('m1', 'base');
    await c.submitTransaction([{ op: 'update', entity: { ...cur!, supersededBy: 'x' }, etag: cur!.etag! }]);
    const after = await c.getEntity('m1', 'base');
    expect(after!.supersededBy).toBe('x');
    expect(after!.etag).not.toBe(cur!.etag);
  });
  it('beforeSubmit は submit 前に1回呼ばれる', async () => {
    const c = createFakeTableClient();
    let called = 0;
    c.beforeSubmit = async () => { called++; };
    await c.createEntity(ent('m1', 'r1'));
    const cur = await c.getEntity('m1', 'r1');
    await c.submitTransaction([{ op: 'update', entity: cur!, etag: cur!.etag! }]);
    expect(called).toBe(1);
  });
});
```

- [ ] **Step 4: テストを実行して緑を確認**

Run: `pnpm --filter @oip/decision test -- fakeTableClient`
Expected: PASS（4 tests）。fake は実装済みのため緑になる（fake は test support で、その正しさ自体をここで固定する）。

- [ ] **Step 5: typecheck**

Run: `pnpm --filter @oip/decision typecheck`
Expected: エラー無し

- [ ] **Step 6: コミット**

```bash
git add packages/decision/src/ledger/tableLedger.ts packages/decision/test/support/fakeTableClient.ts packages/decision/test/support/fakeTableClient.test.ts
git -c gpg.ssh.program=ssh-keygen commit -m "test(decision): TableClientLike型とfake(ETag/412)を追加"
```

---

## Task 3: createTableLedger（契約適合、supersede は素朴実装）

`TableClientLike` を受け取り `LedgerRepository` を実装。構造ガードは `buildEntry` 再利用。この段階では supersede も単純 `createEntity`（並行ガードは Task 4）。

**Files:**

- Modify: `packages/decision/src/ledger/tableLedger.ts`（`createTableLedger` を追記）
- Modify: `packages/decision/src/index.ts`
- Create: `packages/decision/test/tableLedger.test.ts`

**Interfaces:**

- Consumes: `buildEntry`（`./inMemoryLedger.js`）, `TableClientLike`（Task 2）
- Produces: `createTableLedger(client: TableClientLike, idgen: () => string): LedgerRepository`

- [ ] **Step 1: 契約テストを table に適用（失敗する）**

`packages/decision/test/tableLedger.test.ts`:

```typescript
import { createTableLedger } from '../src/ledger/tableLedger.js';
import { createFakeTableClient } from './support/fakeTableClient.js';
import { runLedgerContract, counter } from './support/ledgerContract.js';

runLedgerContract('tableLedger', () => createTableLedger(createFakeTableClient(), counter()));
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `pnpm --filter @oip/decision test -- tableLedger`
Expected: FAIL（`createTableLedger` 未 export）

- [ ] **Step 3: createTableLedger を実装（tableLedger.ts に追記）**

`packages/decision/src/ledger/tableLedger.ts` の末尾に追記:

```typescript
import type { LedgerRepository, AppendInput } from '../ports.js';
import type { LedgerEntry } from '../types.js';
import { buildEntry } from './inMemoryLedger.js';

function toEntity(e: LedgerEntry): LedgerTableEntity {
  return {
    partitionKey: e.meetingId, rowKey: e.id, kind: e.kind, state: e.state,
    version: e.version, owner: e.owner, recordedAt: e.recordedAt, supersedes: e.supersedes,
    payloadJson: JSON.stringify(e.payload),
    approvalJson: e.approval ? JSON.stringify(e.approval) : undefined,
    deliveryRefJson: e.deliveryRef ? JSON.stringify(e.deliveryRef) : undefined,
  };
}

function fromEntity(ent: LedgerTableEntity): LedgerEntry {
  return {
    id: ent.rowKey, meetingId: ent.partitionKey,
    kind: ent.kind as LedgerEntry['kind'], state: ent.state as LedgerEntry['state'],
    payload: JSON.parse(ent.payloadJson) as LedgerEntry['payload'],
    version: ent.version, owner: ent.owner, recordedAt: ent.recordedAt, supersedes: ent.supersedes,
    approval: ent.approvalJson ? JSON.parse(ent.approvalJson) : undefined,
    deliveryRef: ent.deliveryRefJson ? JSON.parse(ent.deliveryRefJson) : undefined,
  };
}

export function createTableLedger(client: TableClientLike, idgen: () => string): LedgerRepository {
  return {
    async append(input: AppendInput): Promise<LedgerEntry> {
      const existing = await client.listByPartition(input.meetingId);
      const entry = buildEntry(existing.map(fromEntity), idgen(), input);
      await client.createEntity(toEntity(entry));
      return entry;
    },
    async get(id: string): Promise<LedgerEntry | null> {
      const ent = await client.findByRowKey(id);
      return ent ? fromEntity(ent) : null;
    },
    async getByMeeting(meetingId: string): Promise<LedgerEntry[]> {
      return (await client.listByPartition(meetingId)).map(fromEntity);
    },
  };
}
```

- [ ] **Step 4: index.ts から re-export**

`packages/decision/src/index.ts` に追記（既存 export の並びに合わせる）:

```typescript
export { createTableLedger } from './ledger/tableLedger.js';
export type { TableClientLike, LedgerTableEntity, TxAction } from './ledger/tableLedger.js';
```

- [ ] **Step 5: 実行して緑を確認**

Run: `pnpm --filter @oip/decision test -- tableLedger`
Expected: PASS（契約 5 tests）

- [ ] **Step 6: typecheck + パッケージ全テスト**

Run: `pnpm --filter @oip/decision typecheck && pnpm --filter @oip/decision test`
Expected: すべて PASS

- [ ] **Step 7: コミット**

```bash
git add packages/decision/src/ledger/tableLedger.ts packages/decision/src/index.ts packages/decision/test/tableLedger.test.ts
git -c gpg.ssh.program=ssh-keygen commit -m "feat(decision): createTableLedger(契約適合)を追加"
```

---

## Task 4: 並行 supersede の構造防止（ETag トランザクション）

同一 base への並行 supersede を storage 層で1回に制限する。`beforeSubmit` フックで競合を決定的に再現する。

**Files:**

- Modify: `packages/decision/src/ledger/tableLedger.ts`（supersede 分岐を submitTransaction へ）
- Modify: `packages/decision/test/tableLedger.test.ts`（並行テスト追加）

**Interfaces:**

- Consumes: `createFakeTableClient` の `beforeSubmit`

- [ ] **Step 1: 並行テストを追加（失敗する）**

`packages/decision/test/tableLedger.test.ts` に追記:

```typescript
import { describe, expect, it } from 'vitest';
import type { AppendInput } from '../src/index.js';

const base: AppendInput = {
  meetingId: 'm1', kind: 'agreement', state: 'ai_inferred',
  payload: { id: 'a1', kind: 'agreement', meetingId: 'm1', text: 'X', basis: [], state: 'ai_inferred' },
  owner: 'system', recordedAt: '2026-07-11T00:00:00.000Z',
};
const approve = (supersedes: string): AppendInput => ({
  ...base, state: 'approved_decision', supersedes,
  approval: { approver: 'a', approvedAt: '2026-07-11T00:00:00.000Z', basis: 'x' },
});

describe('tableLedger 並行 supersede', () => {
  it('同一 base への並行 supersede は後発を拒否する (rule7)', async () => {
    const client = createFakeTableClient();
    let n = 0; const idgen = () => `e${++n}`;
    const led = createTableLedger(client, idgen);
    const b = await led.append({ ...base });
    // 我々の submit 直前に、競合ライタが先に base を supersede する。
    client.beforeSubmit = async () => {
      client.beforeSubmit = undefined; // 1回だけ
      await led.append(approve(b.id));
    };
    await expect(led.append(approve(b.id))).rejects.toThrow(/no longer head|concurrent/);
    // base を supersede したのは1エントリだけ。
    const supersederCount = (await led.getByMeeting('m1')).filter((e) => e.supersedes === b.id).length;
    expect(supersederCount).toBe(1);
  });
});
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `pnpm --filter @oip/decision test -- tableLedger`
Expected: FAIL（素朴実装では両方 createEntity 成功 → reject されず、supersederCount=2）

- [ ] **Step 3: supersede 分岐を ETag トランザクションへ変更**

`packages/decision/src/ledger/tableLedger.ts` の `append` を差し替え:

```typescript
    async append(input: AppendInput): Promise<LedgerEntry> {
      const existing = await client.listByPartition(input.meetingId);
      const entry = buildEntry(existing.map(fromEntity), idgen(), input);
      const newEnt = toEntity(entry);
      if (input.supersedes) {
        // buildEntry が base の存在を保証済み。
        const baseEnt = existing.find((e) => e.rowKey === input.supersedes)!;
        try {
          await client.submitTransaction([
            { op: 'create', entity: newEnt },
            { op: 'update', entity: { ...baseEnt, supersededBy: entry.id }, etag: baseEnt.etag! },
          ]);
        } catch (err) {
          if ((err as { statusCode?: number }).statusCode === 412) {
            throw new Error(`entry ${input.supersedes} is no longer head (concurrent supersede)`);
          }
          throw err;
        }
      } else {
        await client.createEntity(newEnt);
      }
      return entry;
    },
```

- [ ] **Step 4: 実行して緑を確認**

Run: `pnpm --filter @oip/decision test -- tableLedger`
Expected: PASS（契約 5 + 並行 1）

- [ ] **Step 5: decision 全テスト + typecheck**

Run: `pnpm --filter @oip/decision typecheck && pnpm --filter @oip/decision test`
Expected: すべて PASS

- [ ] **Step 6: コミット**

```bash
git add packages/decision/src/ledger/tableLedger.ts packages/decision/test/tableLedger.test.ts
git -c gpg.ssh.program=ssh-keygen commit -m "feat(decision): 並行supersedeをETagトランザクションで構造防止(rule7)"
```

---

## Task 5: composition 配線 と 実 TableClient shim

`LEDGER_TABLE` で tableLedger を選ぶ純粋関数 `resolveLedgerKind` を追加（オフラインテスト）。実 `@azure/data-tables` を包む shim を app に追加（未テストの委譲 seam）。

**Files:**

- Modify: `apps/ingest-func/package.json`
- Create: `apps/ingest-func/src/ledger/azureTableClient.ts`
- Modify: `apps/ingest-func/src/composition.ts`
- Modify: `apps/ingest-func/test/composition.test.ts`

**Interfaces:**

- Produces: `resolveLedgerKind(env): { kind: 'table'; table: string } | { kind: 'file'; path: string }`（未設定は throw）
- Produces: `createAzureTableClient(table: string, env: NodeJS.ProcessEnv): TableClientLike`
- Consumes: `createTableLedger`, `createJsonFileLedger`

- [ ] **Step 1: 依存を追加**

`apps/ingest-func/package.json` の `dependencies` に追記:

```json
    "@azure/data-tables": "^13.3.1",
    "@azure/identity": "^4.5.0",
```

Run: `pnpm install`
Expected: 成功（`make security` の osv は Step 8 で確認）

- [ ] **Step 2: resolveLedgerKind の失敗テストを書く**

`apps/ingest-func/test/composition.test.ts` を全置換:

```typescript
import { describe, expect, it } from 'vitest';
import { buildDecisionServices, resolveLedgerKind } from '../src/composition.js';

describe('resolveLedgerKind', () => {
  it('LEDGER_TABLE 優先で table を選ぶ', () => {
    expect(resolveLedgerKind({ LEDGER_TABLE: 'oipledger', LEDGER_PATH: '/x' })).toEqual({ kind: 'table', table: 'oipledger' });
  });
  it('LEDGER_TABLE 無し・LEDGER_PATH ありは file', () => {
    expect(resolveLedgerKind({ LEDGER_PATH: '/x' })).toEqual({ kind: 'file', path: '/x' });
  });
  it('どちらも無ければ fail-closed (throw)', () => {
    expect(() => resolveLedgerKind({})).toThrow(/LEDGER_TABLE|LEDGER_PATH/);
  });
});

describe('buildDecisionServices', () => {
  it('LEDGER_PATH で台帳サービスを構築する', () => {
    const svc = buildDecisionServices({ LEDGER_PATH: '/tmp/test-oip-ledger.jsonl' });
    expect(svc.ingest.ingest).toBeTypeOf('function');
    expect(svc.approvals.approve).toBeTypeOf('function');
  });
  it('未設定は fail-closed', () => {
    expect(() => buildDecisionServices({})).toThrow(/LEDGER_TABLE|LEDGER_PATH/);
  });
});
```

- [ ] **Step 3: 実行して失敗を確認**

Run: `pnpm --filter @oip/ingest-func test -- composition`
Expected: FAIL（`resolveLedgerKind` 未 export、`buildDecisionServices` の env 引数未対応）

- [ ] **Step 4: shim を作成**

`apps/ingest-func/src/ledger/azureTableClient.ts`:

```typescript
import { TableClient, odata, type TableEntity } from '@azure/data-tables';
import { DefaultAzureCredential } from '@azure/identity';
import type { LedgerTableEntity, TableClientLike, TxAction } from '@oip/decision';

// 実 @azure/data-tables を TableClientLike へ写す薄い shim。
// SDK セマンティクス整合は後続の Azurite 統合テストで検証（本 slice ではオフライン非対象の委譲 seam）。
export function createAzureTableClient(table: string, env: NodeJS.ProcessEnv): TableClientLike {
  const cs = env.LEDGER_TABLE_CONNECTION_STRING;
  const client = cs
    ? TableClient.fromConnectionString(cs, table)
    : new TableClient(env.LEDGER_TABLE_ENDPOINT ?? '', table, new DefaultAzureCredential());

  const toSdk = (e: LedgerTableEntity): TableEntity => ({ ...e }) as unknown as TableEntity;
  const fromSdk = (e: Record<string, unknown>): LedgerTableEntity => e as unknown as LedgerTableEntity;

  return {
    async createEntity(entity) { await client.createEntity(toSdk(entity)); },
    async getEntity(pk, rk) {
      try { return fromSdk(await client.getEntity(pk, rk)); }
      catch (err) { if ((err as { statusCode?: number }).statusCode === 404) return null; throw err; }
    },
    async findByRowKey(rk) {
      for await (const e of client.listEntities({ queryOptions: { filter: odata`RowKey eq ${rk}` } })) return fromSdk(e);
      return null;
    },
    async listByPartition(pk) {
      const out: LedgerTableEntity[] = [];
      for await (const e of client.listEntities({ queryOptions: { filter: odata`PartitionKey eq ${pk}` } })) out.push(fromSdk(e));
      return out;
    },
    async submitTransaction(actions: TxAction[]) {
      await client.submitTransaction(actions.map((a) =>
        a.op === 'create'
          ? ['create', toSdk(a.entity)]
          : ['update', toSdk(a.entity), 'Merge', { etag: a.etag }],
      ));
    },
  };
}
```

- [ ] **Step 5: composition を書き換え**

`apps/ingest-func/src/composition.ts` を全置換:

```typescript
import {
  markerExtractor,
  createJsonFileLedger,
  createTableLedger,
  createFakeDelivery,
  createIngestMeetingService,
  createApprovalService,
  type LedgerRepository,
} from '@oip/decision';
import { createAzureTableClient } from './ledger/azureTableClient.js';

let seq = 0;
const idgen = () => `led-${Date.now()}-${++seq}`;
const clock = () => new Date().toISOString();

export type LedgerKind = { kind: 'table'; table: string } | { kind: 'file'; path: string };

// 非交渉ルール10: 保存先が明示されなければ /tmp 等へ平文で書かず fail-closed。
export function resolveLedgerKind(env: NodeJS.ProcessEnv): LedgerKind {
  const table = env.LEDGER_TABLE?.trim();
  if (table) return { kind: 'table', table };
  const path = env.LEDGER_PATH?.trim();
  if (path) return { kind: 'file', path };
  throw new Error('LEDGER_TABLE or LEDGER_PATH is not configured: refuse to persist approval PII to an insecure default');
}

export function buildDecisionServices(env: NodeJS.ProcessEnv = process.env) {
  const cfg = resolveLedgerKind(env);
  const ledger: LedgerRepository = cfg.kind === 'table'
    ? createTableLedger(createAzureTableClient(cfg.table, env), idgen)
    : createJsonFileLedger(cfg.path, idgen);
  const delivery = createFakeDelivery();
  return {
    ingest: createIngestMeetingService({ extract: markerExtractor, ledger, clock }),
    approvals: createApprovalService({ ledger, delivery, clock }),
  };
}
```

- [ ] **Step 6: 実行して緑を確認**

Run: `pnpm --filter @oip/ingest-func test -- composition`
Expected: PASS（resolveLedgerKind 3 + buildDecisionServices 2）

- [ ] **Step 7: app 全体 typecheck + build + test**

Run: `pnpm --filter @oip/ingest-func typecheck && pnpm --filter @oip/ingest-func build && pnpm --filter @oip/ingest-func test`
Expected: すべて PASS（`LedgerRepository` は `@oip/decision` の既存 export。未 export ならこの Step で追加すること: `export type { LedgerRepository } from './ports.js';` を `packages/decision/src/index.ts` に追記し、decision を再ビルド）

- [ ] **Step 8: セキュリティゲート（新規依存）**

Run: `make security`
Expected: semgrep 0 findings / osv-scanner 0 issues（High 検出時は依存バージョンを上げるか Issue 化）

- [ ] **Step 9: コミット**

```bash
git add apps/ingest-func/package.json apps/ingest-func/src apps/ingest-func/test pnpm-lock.yaml packages/decision/src/index.ts
git -c gpg.ssh.program=ssh-keygen commit -m "feat(ingest-func): LEDGER_TABLE配線とTableClient shimを追加"
```

---

## Task 6: infra（Table 資源 + RBAC + appSettings）

Function が Table を使えるよう Bicep を更新する。

**Files:**

- Modify: `infra/modules/functions.bicep`

- [ ] **Step 1: Table 資源を追加**

`infra/modules/functions.bicep` の `deployContainer` 資源の直後に追記:

```bicep
resource tableService 'Microsoft.Storage/storageAccounts/tableServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource ledgerTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-05-01' = {
  parent: tableService
  name: 'oipledger'
}
```

- [ ] **Step 2: Storage Table Data Contributor ロールを追加**

`monitoringMetricsPublisherRole` の var 定義群の並びに追記:

```bicep
var storageTableDataContributorRole = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3')
```

`metricsPublisherRole` 資源の直後に追記:

```bicep
resource storageTableRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, site.id, storageTableDataContributorRole)
  scope: storage
  properties: { principalId: site.identity.principalId, roleDefinitionId: storageTableDataContributorRole, principalType: 'ServicePrincipal' }
}
```

- [ ] **Step 3: appSettings を Table へ切替**

`siteConfig.appSettings` 配列内の `LEDGER_PATH` 行を削除し、代わりに追記:

```bicep
        { name: 'LEDGER_TABLE', value: ledgerTable.name }
        { name: 'LEDGER_TABLE_ENDPOINT', value: storage.properties.primaryEndpoints.table }
```

- [ ] **Step 4: Bicep を検証**

Run: `make bicep`
Expected: エラー無し（`bicep build` 成功）

- [ ] **Step 5: コミット**

```bash
git add infra/modules/functions.bicep
git -c gpg.ssh.program=ssh-keygen commit -m "feat(infra): 意思決定台帳のTable資源とMI RBAC(Table Data Contributor)を追加"
```

---

## Task 7: 縦断検証

全ゲートで整合を確認する。

**Files:** なし（検証のみ）

- [ ] **Step 1: 全テスト**

Run: `pnpm -r test`
Expected: core / decision / ingest-func すべて PASS（新規: fake 4 + tableLedger 6 + composition 5）

- [ ] **Step 2: typecheck + build**

Run: `pnpm -r typecheck && pnpm -r build`
Expected: エラー無し

- [ ] **Step 3: ローカルゲート一式**

Run: `make validate && make security && make bicep`
Expected: すべて PASS（semgrep 0 / osv 0）

- [ ] **Step 4: push（pre-push ゲートが再実行）**

```bash
git push -u origin feat/26-table-ledger-adapter
```

Expected: build/typecheck/test/security/bicep すべて Passed、リモートへ反映

- [ ] **Step 5: PR 作成**（マージは人間レビュー: CONTRIBUTING）

```bash
gh pr create --base main --head feat/26-table-ledger-adapter \
  --title "feat(decision): Table Ledger Adapter(#26 永続層移行)" \
  --body "設計: docs/superpowers/specs/2026-07-12-table-ledger-adapter-design.md ..."
```

---

## Self-Review（記入済み）

- **Spec coverage**: アダプタ(T3)/構造ガード再利用(T3)/並行防止(T4)/スキーマ(T2,T3)/配線fail-closed(T5)/infra+RBAC(T6)/共有契約テスト(T1)/fake+並行テスト(T2,T4)/依存注記(T5) — 全セクションにタスク対応。
- **スコープ外の明示**: Azurite統合テスト・basis暗号化・ingest冪等のstorage原子化・get(id)二次索引は本計画に含めない（spec と一致）。shim(T5)は未テスト委譲 seam として明記。
- **型整合**: `TableClientLike` / `LedgerTableEntity` / `TxAction` は T2 で定義し T3–T5 で同一名を使用。`resolveLedgerKind` の戻り値型は T5 の定義と使用で一致。`createTableLedger(client, idgen)` の引数順は T3 定義と T5 使用で一致。
- **プレースホルダ**: 各コード Step に実コードを記載。TBD/TODO 無し。
