# PoC #25 Meeting→Decision→Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 会議 transcript から合意/未決/タスク候補を抽出し、意思決定台帳へ根拠付きで記録し、人間承認で `approved_decision`・配信へ変換する縦断ドメイン核を、オフライン TDD 検証可能に実装する。

**Architecture:** 新パッケージ `@oip/decision`（ports & adapters, `@oip/core` 依存）。LLM/台帳/配信を ports 化し、決定論 fake（マーカー抽出）＋ in-memory/JSON 台帳＋fake 配信でローカル完結。services（Ingest/Approval/ReviewPacket）に非交渉ルールを型と境界で埋め込む。`apps/ingest-func` に薄い delegator を配線。

**Tech Stack:** TypeScript(ESM/Node16), vitest 3, pnpm workspaces, @azure/functions v4。

## Global Constraints

- ESM: `"type": "module"`, tsconfig extends `../../tsconfig.base.json`(Node16), 相対 import は `.js` 拡張子。
- パッケージ名 `@oip/decision`。`@oip/core` に依存（`workspace:*`）。
- 非交渉ルール: AI は候補(`ai_inferred`)まで。`approved_decision` は `ApprovalService.approve`（承認者必須）経由でのみ生成。基準日/根拠/版/所有者を全 `LedgerEntry` に持たせる。未信頼 transcript は分類のみ（副作用なし）。
- 決定論のため時刻/ID は DI: services は `{ clock: () => string, idgen: () => string }`、ledger は `{ idgen }` を受ける。テストは固定 clock（`'2026-07-11T00:00:00.000Z'`）＋カウンタ idgen。
- 既存ゲートを維持: 各コミット前に `export PATH="$HOME/.local/bin:$HOME/go/bin:$PATH"`、commit は `-c commit.gpgsign=false`。
- 実装は #35 の上の `feat/decision-poc` ブランチ。

## Shared contracts（全タスク共通・逸脱しないこと）

`packages/decision/src/types.ts`:

```ts
export type InformationState =
  | 'ai_inferred' | 'hypothesis' | 'human_reported'
  | 'confirmed_fact' | 'approved_decision' | 'unverified' | 'conflicted';
export type CandidateKind = 'agreement' | 'issue' | 'task';
export interface SourceRef { meetingId: string; utteranceId: string; speaker?: string; text: string; }
export interface CandidateBase { id: string; meetingId: string; text: string; basis: SourceRef[]; state: InformationState; }
export interface AgreementCandidate extends CandidateBase { kind: 'agreement'; confidence?: number; }
export interface OpenIssue extends CandidateBase { kind: 'issue'; }
export interface TaskCandidate extends CandidateBase { kind: 'task'; assigneeHint?: string; dueHint?: string; }
export type Candidate = AgreementCandidate | OpenIssue | TaskCandidate;
export interface Utterance { id: string; speaker: string; text: string; }
export interface Transcript { meetingId: string; title?: string; utterances: Utterance[]; }
export interface ApprovalMeta { approver: string; approvedAt: string; basis: string; conditions?: string; }
export interface DeliveryRef { system: string; externalId: string; }
export interface LedgerEntry {
  id: string; meetingId: string; kind: CandidateKind; state: InformationState;
  payload: Candidate; version: number; owner: string; recordedAt: string;
  supersedes?: string; approval?: ApprovalMeta; deliveryRef?: DeliveryRef;
}
```

`packages/decision/src/ports.ts`:

```ts
import type { Transcript, AgreementCandidate, OpenIssue, TaskCandidate, Candidate, CandidateKind, InformationState, ApprovalMeta, DeliveryRef, LedgerEntry } from './types.js';
export interface ExtractionResult { agreements: AgreementCandidate[]; issues: OpenIssue[]; tasks: TaskCandidate[]; }
export interface ExtractPort { extract(t: Transcript): Promise<ExtractionResult>; }
export interface AppendInput {
  meetingId: string; kind: CandidateKind; state: InformationState; payload: Candidate;
  owner: string; recordedAt: string; supersedes?: string; approval?: ApprovalMeta; deliveryRef?: DeliveryRef;
}
export interface LedgerRepository {
  append(input: AppendInput): Promise<LedgerEntry>;
  get(id: string): Promise<LedgerEntry | null>;
  getByMeeting(meetingId: string): Promise<LedgerEntry[]>;
}
export interface DeliveryPort { deliver(task: TaskCandidate): Promise<DeliveryRef>; }
```

---

### Task 1: `@oip/decision` scaffold + types + ports

**Files:**

- Create: `packages/decision/package.json`, `packages/decision/tsconfig.json`
- Create: `packages/decision/src/types.ts`, `packages/decision/src/ports.ts`, `packages/decision/src/index.ts`
- Test: `packages/decision/test/types.test.ts`

**Interfaces:**

- Produces: all types in Shared contracts above; `index.ts` re-exports `./types.js` and `./ports.js`.

- [ ] **Step 1: scaffold + a shape test**

`packages/decision/package.json`:

```json
{
  "name": "@oip/decision",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": { "build": "tsc", "typecheck": "tsc --noEmit", "test": "vitest run" },
  "dependencies": { "@oip/core": "workspace:*" },
  "devDependencies": { "@types/node": "^20.0.0", "typescript": "^5.6.0", "vitest": "^3.2.7" }
}
```

`packages/decision/tsconfig.json`:

```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "outDir": "dist", "rootDir": "src" }, "include": ["src"] }
```

`packages/decision/test/types.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { AgreementCandidate, LedgerEntry } from '../src/index.js';

describe('domain types', () => {
  it('候補は kind と basis と state を持つ', () => {
    const c: AgreementCandidate = {
      id: 'a1', kind: 'agreement', meetingId: 'm1', text: 'X で合意',
      basis: [{ meetingId: 'm1', utteranceId: 'u1', text: '合意: X' }], state: 'ai_inferred',
    };
    expect(c.kind).toBe('agreement');
    expect(c.basis[0].utteranceId).toBe('u1');
  });
  it('台帳エントリは version/owner/recordedAt を持つ', () => {
    const e: LedgerEntry = {
      id: 'e1', meetingId: 'm1', kind: 'agreement', state: 'ai_inferred',
      payload: { id: 'a1', kind: 'agreement', meetingId: 'm1', text: 'X', basis: [], state: 'ai_inferred' },
      version: 1, owner: 'system', recordedAt: '2026-07-11T00:00:00.000Z',
    };
    expect(e.version).toBe(1);
  });
});
```

- [ ] **Step 2: run test → RED**

Run: `pnpm --filter @oip/decision test`
Expected: FAIL（`src/index.js` 無し）。

- [ ] **Step 3: implement types.ts + ports.ts (Shared contracts の内容を verbatim) + index.ts**

`packages/decision/src/index.ts`:

```ts
export * from './types.js';
export * from './ports.js';
```

(types.ts と ports.ts は上の Shared contracts の内容をそのまま。)

- [ ] **Step 4: GREEN + typecheck**

Run: `pnpm --filter @oip/decision test && pnpm --filter @oip/decision typecheck`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/decision pnpm-lock.yaml
git -c commit.gpgsign=false commit -m "feat(decision): パッケージ骨組みとドメイン型・portsを追加"
```

---

### Task 2: マーカー抽出 fake（ExtractPort）

**Files:**

- Create: `packages/decision/src/extract/markerExtractor.ts`
- Create: `packages/decision/test/fixtures/transcript.ts`
- Test: `packages/decision/test/markerExtractor.test.ts`

**Interfaces:**

- Consumes: `Transcript`, `ExtractionResult`, `ExtractPort`（Task 1）。
- Produces: `markerExtractor: ExtractPort`（決定論）。候補 id は `${meetingId}:${utteranceId}:${kind}` で導出、state=`ai_inferred`、basis=元 utterance。

- [ ] **Step 1: fixture + テスト**

`packages/decision/test/fixtures/transcript.ts`:

```ts
import type { Transcript } from '../../src/index.js';
export const sampleTranscript: Transcript = {
  meetingId: 'm1', title: 'Sprint Planning',
  utterances: [
    { id: 'u1', speaker: 'Alice', text: '合意: 次期リリースは7月末' },
    { id: 'u2', speaker: 'Bob', text: 'TODO: CI設定をレビューする' },
    { id: 'u3', speaker: 'Carol', text: '予算はどうする?' },
    { id: 'u4', speaker: 'Alice', text: '未決: 採用計画の承認者' },
    { id: 'u5', speaker: 'Bob', text: '雑談です' },
  ],
};
```

`packages/decision/test/markerExtractor.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { markerExtractor } from '../src/extract/markerExtractor.js';
import { sampleTranscript } from './fixtures/transcript.js';

describe('markerExtractor', () => {
  it('マーカーで種別に振り分け、basis と ai_inferred を付ける', async () => {
    const r = await markerExtractor.extract(sampleTranscript);
    expect(r.agreements.map((a) => a.text)).toEqual(['合意: 次期リリースは7月末']);
    expect(r.tasks.map((t) => t.text)).toEqual(['TODO: CI設定をレビューする']);
    expect(r.issues.map((i) => i.text).sort()).toEqual(['未決: 採用計画の承認者', '予算はどうする?'].sort());
    const a = r.agreements[0];
    expect(a.kind).toBe('agreement');
    expect(a.state).toBe('ai_inferred');
    expect(a.basis).toEqual([{ meetingId: 'm1', utteranceId: 'u1', speaker: 'Alice', text: '合意: 次期リリースは7月末' }]);
    expect(a.id).toBe('m1:u1:agreement');
  });
  it('マーカー無し発言は候補にしない', async () => {
    const r = await markerExtractor.extract(sampleTranscript);
    const all = [...r.agreements, ...r.issues, ...r.tasks].map((c) => c.text);
    expect(all).not.toContain('雑談です');
  });
});
```

- [ ] **Step 2: RED**

Run: `pnpm --filter @oip/decision test markerExtractor`
Expected: FAIL（`markerExtractor.js` 無し）。

- [ ] **Step 3: implement**

`packages/decision/src/extract/markerExtractor.ts`:

```ts
import type { ExtractPort, ExtractionResult } from '../ports.js';
import type { Transcript, Utterance, SourceRef, AgreementCandidate, OpenIssue, TaskCandidate } from '../types.js';

function refOf(t: Transcript, u: Utterance): SourceRef {
  return { meetingId: t.meetingId, utteranceId: u.id, speaker: u.speaker, text: u.text };
}

// 決定論マーカー抽出 (旧 LLM の代替 fake)。副作用なし・分類のみ (非交渉ルール3)。
export const markerExtractor: ExtractPort = {
  async extract(t: Transcript): Promise<ExtractionResult> {
    const agreements: AgreementCandidate[] = [];
    const issues: OpenIssue[] = [];
    const tasks: TaskCandidate[] = [];
    for (const u of t.utterances) {
      const text = u.text.trim();
      const basis = [refOf(t, u)];
      if (/^(合意|決定)[:：]/.test(text)) {
        agreements.push({ id: `${t.meetingId}:${u.id}:agreement`, kind: 'agreement', meetingId: t.meetingId, text, basis, state: 'ai_inferred' });
      } else if (/^(TODO|タスク)[:：]/i.test(text)) {
        tasks.push({ id: `${t.meetingId}:${u.id}:task`, kind: 'task', meetingId: t.meetingId, text, basis, state: 'ai_inferred' });
      } else if (/^未決[:：]/.test(text) || text.endsWith('?') || text.endsWith('？')) {
        issues.push({ id: `${t.meetingId}:${u.id}:issue`, kind: 'issue', meetingId: t.meetingId, text, basis, state: 'ai_inferred' });
      }
    }
    return { agreements, issues, tasks };
  },
};
```

- [ ] **Step 4: GREEN + typecheck**

Run: `pnpm --filter @oip/decision test && pnpm --filter @oip/decision typecheck`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/decision/src/extract packages/decision/test
git -c commit.gpgsign=false commit -m "feat(decision): 決定論マーカー抽出fake(ExtractPort)を追加"
```

---

### Task 3: 台帳（in-memory + JSON adapter）

**Files:**

- Create: `packages/decision/src/ledger/inMemoryLedger.ts`
- Create: `packages/decision/src/ledger/jsonFileLedger.ts`
- Test: `packages/decision/test/inMemoryLedger.test.ts`, `packages/decision/test/jsonFileLedger.test.ts`

**Interfaces:**

- Consumes: `LedgerRepository`, `AppendInput`, `LedgerEntry`（Task 1）。
- Produces:
  - `createInMemoryLedger(idgen: () => string): LedgerRepository`
  - `createJsonFileLedger(filePath: string, idgen: () => string): LedgerRepository`（append-only JSON Lines）
  - version 規則: `supersedes` 指定時は被参照 entry.version + 1、無ければ 1。

- [ ] **Step 1: テスト**

`packages/decision/test/inMemoryLedger.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createInMemoryLedger } from '../src/ledger/inMemoryLedger.js';
import type { AppendInput } from '../src/index.js';

function counter() { let n = 0; return () => `e${++n}`; }
const base: Omit<AppendInput, 'supersedes'> = {
  meetingId: 'm1', kind: 'agreement', state: 'ai_inferred',
  payload: { id: 'a1', kind: 'agreement', meetingId: 'm1', text: 'X', basis: [], state: 'ai_inferred' },
  owner: 'system', recordedAt: '2026-07-11T00:00:00.000Z',
};

describe('inMemoryLedger', () => {
  it('append は id と version=1 を採番し get で取れる', async () => {
    const led = createInMemoryLedger(counter());
    const e = await led.append({ ...base });
    expect(e.id).toBe('e1');
    expect(e.version).toBe(1);
    expect(await led.get('e1')).toEqual(e);
  });
  it('supersedes で version が繰り上がる', async () => {
    const led = createInMemoryLedger(counter());
    const v1 = await led.append({ ...base });
    const v2 = await led.append({ ...base, state: 'approved_decision', supersedes: v1.id });
    expect(v2.version).toBe(2);
    expect(v2.supersedes).toBe('e1');
  });
  it('getByMeeting は当該会議の全 entry を返す', async () => {
    const led = createInMemoryLedger(counter());
    await led.append({ ...base });
    await led.append({ ...base, meetingId: 'm2' });
    expect((await led.getByMeeting('m1')).length).toBe(1);
  });
});
```

`packages/decision/test/jsonFileLedger.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonFileLedger } from '../src/ledger/jsonFileLedger.js';
import type { AppendInput } from '../src/index.js';

function counter() { let n = 0; return () => `e${++n}`; }
const base: AppendInput = {
  meetingId: 'm1', kind: 'agreement', state: 'ai_inferred',
  payload: { id: 'a1', kind: 'agreement', meetingId: 'm1', text: 'X', basis: [], state: 'ai_inferred' },
  owner: 'system', recordedAt: '2026-07-11T00:00:00.000Z',
};

describe('jsonFileLedger', () => {
  it('追記して再読込しても取得できる (append-only JSONL)', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'ledger-')), 'ledger.jsonl');
    const led = createJsonFileLedger(file, counter());
    const e = await led.append({ ...base });
    expect(readFileSync(file, 'utf8').trim().split('\n').length).toBe(1);
    const led2 = createJsonFileLedger(file, counter());
    expect(await led2.get(e.id)).toEqual(e);
  });
});
```

- [ ] **Step 2: RED**

Run: `pnpm --filter @oip/decision test Ledger`
Expected: FAIL（実装無し）。

- [ ] **Step 3: implement**

`packages/decision/src/ledger/inMemoryLedger.ts`:

```ts
import type { LedgerRepository, AppendInput } from '../ports.js';
import type { LedgerEntry } from '../types.js';

export function buildEntry(entries: LedgerEntry[], id: string, input: AppendInput): LedgerEntry {
  const prev = input.supersedes ? entries.find((e) => e.id === input.supersedes) : undefined;
  const version = prev ? prev.version + 1 : 1;
  return { id, version, ...input };
}

export function createInMemoryLedger(idgen: () => string): LedgerRepository {
  const entries: LedgerEntry[] = [];
  return {
    async append(input) { const e = buildEntry(entries, idgen(), input); entries.push(e); return e; },
    async get(id) { return entries.find((e) => e.id === id) ?? null; },
    async getByMeeting(meetingId) { return entries.filter((e) => e.meetingId === meetingId); },
  };
}
```

`packages/decision/src/ledger/jsonFileLedger.ts`:

```ts
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import type { LedgerRepository, AppendInput } from '../ports.js';
import type { LedgerEntry } from '../types.js';
import { buildEntry } from './inMemoryLedger.js';

function readAll(filePath: string): LedgerEntry[] {
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as LedgerEntry);
}

// append-only JSON Lines。1行=1 LedgerEntry。読み取りは都度ファイルから (PoC 規模で十分)。
export function createJsonFileLedger(filePath: string, idgen: () => string): LedgerRepository {
  return {
    async append(input: AppendInput) {
      const e = buildEntry(readAll(filePath), idgen(), input);
      appendFileSync(filePath, `${JSON.stringify(e)}\n`, 'utf8');
      return e;
    },
    async get(id) { return readAll(filePath).find((e) => e.id === id) ?? null; },
    async getByMeeting(meetingId) { return readAll(filePath).filter((e) => e.meetingId === meetingId); },
  };
}
```

- [ ] **Step 4: GREEN + typecheck**

Run: `pnpm --filter @oip/decision test && pnpm --filter @oip/decision typecheck`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/decision/src/ledger packages/decision/test
git -c commit.gpgsign=false commit -m "feat(decision): 意思決定台帳(in-memory + JSONL adapter)を追加"
```

---

### Task 4: `IngestMeetingService`

**Files:**

- Create: `packages/decision/src/services/ingestMeetingService.ts`
- Test: `packages/decision/test/ingestMeetingService.test.ts`

**Interfaces:**

- Consumes: `ExtractPort`, `LedgerRepository`, `Transcript`（Task 1-3）。
- Produces: `createIngestMeetingService(deps): { ingest(t: Transcript): Promise<{ entries: LedgerEntry[] }> }`
  - `deps = { extract: ExtractPort; ledger: LedgerRepository; clock: () => string; owner?: string }`
  - 各候補を state=`ai_inferred` で append。決定(`approved_decision`)は生成しない。

- [ ] **Step 1: テスト**

`packages/decision/test/ingestMeetingService.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { markerExtractor } from '../src/extract/markerExtractor.js';
import { createInMemoryLedger } from '../src/ledger/inMemoryLedger.js';
import { createIngestMeetingService } from '../src/services/ingestMeetingService.js';
import { sampleTranscript } from './fixtures/transcript.js';

function counter() { let n = 0; return () => `e${++n}`; }
const clock = () => '2026-07-11T00:00:00.000Z';

describe('IngestMeetingService', () => {
  it('抽出候補を ai_inferred で台帳へ記録し、決定は作らない', async () => {
    const ledger = createInMemoryLedger(counter());
    const svc = createIngestMeetingService({ extract: markerExtractor, ledger, clock });
    const { entries } = await svc.ingest(sampleTranscript);
    expect(entries.length).toBe(4); // 1 agreement + 1 task + 2 issue
    expect(entries.every((e) => e.state === 'ai_inferred')).toBe(true);
    expect(entries.some((e) => e.state === 'approved_decision')).toBe(false);
    expect(entries.every((e) => e.recordedAt === '2026-07-11T00:00:00.000Z')).toBe(true);
    expect((await ledger.getByMeeting('m1')).length).toBe(4);
  });
});
```

- [ ] **Step 2: RED** — `pnpm --filter @oip/decision test ingestMeetingService` → FAIL。

- [ ] **Step 3: implement**

`packages/decision/src/services/ingestMeetingService.ts`:

```ts
import type { ExtractPort, LedgerRepository } from '../ports.js';
import type { Transcript, Candidate, LedgerEntry } from '../types.js';

export interface IngestDeps { extract: ExtractPort; ledger: LedgerRepository; clock: () => string; owner?: string; }

export function createIngestMeetingService(deps: IngestDeps) {
  const owner = deps.owner ?? 'system';
  return {
    // AI は候補まで。決定はしない (非交渉ルール2)。
    async ingest(t: Transcript): Promise<{ entries: LedgerEntry[] }> {
      const r = await deps.extract(t);
      const candidates: Candidate[] = [...r.agreements, ...r.tasks, ...r.issues];
      const entries: LedgerEntry[] = [];
      for (const c of candidates) {
        entries.push(await deps.ledger.append({
          meetingId: c.meetingId, kind: c.kind, state: 'ai_inferred',
          payload: c, owner, recordedAt: deps.clock(),
        }));
      }
      return { entries };
    },
  };
}
```

- [ ] **Step 4: GREEN + typecheck** — `pnpm --filter @oip/decision test && pnpm --filter @oip/decision typecheck` → PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/decision/src/services/ingestMeetingService.ts packages/decision/test/ingestMeetingService.test.ts
git -c commit.gpgsign=false commit -m "feat(decision): IngestMeetingService(候補→台帳, AIは決定しない)を追加"
```

---

### Task 5: `ApprovalService` + fake delivery

**Files:**

- Create: `packages/decision/src/delivery/fakeDelivery.ts`
- Create: `packages/decision/src/services/approvalService.ts`
- Test: `packages/decision/test/approvalService.test.ts`

**Interfaces:**

- Consumes: `LedgerRepository`, `DeliveryPort`, `LedgerEntry`（Task 1-3）。
- Produces:
  - `createFakeDelivery(): DeliveryPort & { delivered: TaskCandidate[] }`
  - `createApprovalService(deps): { approve; approveWithConditions; reject; requestMoreInfo }`
    - `deps = { ledger; delivery; clock }`
    - `approve(entryId, { approver, basis })`: 対象 entry の payload を新版で append。agreement→ state=`approved_decision`＋approval メタ、supersedes=entryId。task→ 承認後 `delivery.deliver` し deliveryRef を記録。`approver` 空文字は拒否(throw)。issue は承認不可(throw)。
    - `approveWithConditions(entryId, { approver, basis, conditions })`: 同上＋conditions 記録。
    - `reject(entryId, { approver, basis })`: 差戻し。state 据置の新版を `conflicted`? いいえ → 元 state のまま approval に理由だけ残す新版を append（supersedes）。
    - `requestMoreInfo(entryId, { approver, basis })`: state=`unverified` の新版を append。

- [ ] **Step 1: テスト**

`packages/decision/test/approvalService.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createInMemoryLedger } from '../src/ledger/inMemoryLedger.js';
import { createFakeDelivery } from '../src/delivery/fakeDelivery.js';
import { createApprovalService } from '../src/services/approvalService.js';
import type { AppendInput } from '../src/index.js';

function counter() { let n = 0; return () => `e${++n}`; }
const clock = () => '2026-07-11T00:00:00.000Z';
const agreement: AppendInput = {
  meetingId: 'm1', kind: 'agreement', state: 'ai_inferred',
  payload: { id: 'a1', kind: 'agreement', meetingId: 'm1', text: 'X で合意', basis: [], state: 'ai_inferred' },
  owner: 'system', recordedAt: clock(),
};
const task: AppendInput = { ...agreement, kind: 'task', payload: { id: 't1', kind: 'task', meetingId: 'm1', text: 'CI設定', basis: [], state: 'ai_inferred' } };

describe('ApprovalService', () => {
  it('approve は approved_decision の新版を承認メタ付きで作る', async () => {
    const ledger = createInMemoryLedger(counter());
    const svc = createApprovalService({ ledger, delivery: createFakeDelivery(), clock });
    const c = await ledger.append({ ...agreement });
    const d = await svc.approve(c.id, { approver: 'alice@example.com', basis: '議事録 u1' });
    expect(d.state).toBe('approved_decision');
    expect(d.version).toBe(2);
    expect(d.supersedes).toBe(c.id);
    expect(d.approval).toEqual({ approver: 'alice@example.com', approvedAt: clock(), basis: '議事録 u1' });
  });
  it('承認者が空なら拒否 (人間承認必須)', async () => {
    const ledger = createInMemoryLedger(counter());
    const svc = createApprovalService({ ledger, delivery: createFakeDelivery(), clock });
    const c = await ledger.append({ ...agreement });
    await expect(svc.approve(c.id, { approver: '', basis: 'x' })).rejects.toThrow();
  });
  it('issue は承認不可', async () => {
    const ledger = createInMemoryLedger(counter());
    const svc = createApprovalService({ ledger, delivery: createFakeDelivery(), clock });
    const c = await ledger.append({ ...agreement, kind: 'issue', payload: { id: 'i1', kind: 'issue', meetingId: 'm1', text: '?', basis: [], state: 'ai_inferred' } });
    await expect(svc.approve(c.id, { approver: 'a', basis: 'x' })).rejects.toThrow();
  });
  it('承認された task は delivery され deliveryRef が記録される', async () => {
    const ledger = createInMemoryLedger(counter());
    const delivery = createFakeDelivery();
    const svc = createApprovalService({ ledger, delivery, clock });
    const c = await ledger.append({ ...task });
    const d = await svc.approve(c.id, { approver: 'a', basis: 'x' });
    expect(delivery.delivered.length).toBe(1);
    expect(d.deliveryRef?.system).toBe('fake');
  });
  it('requestMoreInfo は unverified の新版を作る', async () => {
    const ledger = createInMemoryLedger(counter());
    const svc = createApprovalService({ ledger, delivery: createFakeDelivery(), clock });
    const c = await ledger.append({ ...agreement });
    const d = await svc.requestMoreInfo(c.id, { approver: 'a', basis: '要確認' });
    expect(d.state).toBe('unverified');
    expect(d.supersedes).toBe(c.id);
  });
});
```

- [ ] **Step 2: RED** — `pnpm --filter @oip/decision test approvalService` → FAIL。

- [ ] **Step 3: implement**

`packages/decision/src/delivery/fakeDelivery.ts`:

```ts
import type { DeliveryPort, DeliveryRef } from '../ports.js';
import type { TaskCandidate } from '../types.js';

export function createFakeDelivery(): DeliveryPort & { delivered: TaskCandidate[] } {
  const delivered: TaskCandidate[] = [];
  return {
    delivered,
    async deliver(task: TaskCandidate): Promise<DeliveryRef> {
      delivered.push(task);
      return { system: 'fake', externalId: `fake-${task.id}` };
    },
  };
}
```

`packages/decision/src/services/approvalService.ts`:

```ts
import type { LedgerRepository, DeliveryPort } from '../ports.js';
import type { LedgerEntry, ApprovalMeta, InformationState, TaskCandidate, DeliveryRef } from '../types.js';

export interface ApprovalDeps { ledger: LedgerRepository; delivery: DeliveryPort; clock: () => string; }
export interface ApproveInput { approver: string; basis: string; conditions?: string; }

async function requireEntry(ledger: LedgerRepository, entryId: string): Promise<LedgerEntry> {
  const e = await ledger.get(entryId);
  if (!e) throw new Error(`ledger entry not found: ${entryId}`);
  return e;
}

export function createApprovalService(deps: ApprovalDeps) {
  const { ledger, delivery, clock } = deps;

  // 人間承認の唯一の入口。approved_decision はここでのみ生成される (非交渉ルール2,4)。
  async function appendVersion(base: LedgerEntry, state: InformationState, approval?: ApprovalMeta, deliveryRef?: DeliveryRef): Promise<LedgerEntry> {
    return ledger.append({
      meetingId: base.meetingId, kind: base.kind, state,
      payload: { ...base.payload, state }, owner: base.owner,
      recordedAt: clock(), supersedes: base.id, approval, deliveryRef,
    });
  }

  async function decide(entryId: string, input: ApproveInput, conditions?: string): Promise<LedgerEntry> {
    if (!input.approver.trim()) throw new Error('approver is required (人間承認必須)');
    const base = await requireEntry(ledger, entryId);
    if (base.kind === 'issue') throw new Error('issue は承認対象ではない');
    const approval: ApprovalMeta = { approver: input.approver, approvedAt: clock(), basis: input.basis, ...(conditions ? { conditions } : {}) };
    if (base.kind === 'task') {
      const ref = await delivery.deliver(base.payload as TaskCandidate);
      return appendVersion(base, 'approved_decision', approval, ref);
    }
    return appendVersion(base, 'approved_decision', approval);
  }

  return {
    approve: (entryId: string, input: ApproveInput) => decide(entryId, input),
    approveWithConditions: (entryId: string, input: ApproveInput & { conditions: string }) => decide(entryId, input, input.conditions),
    async reject(entryId: string, input: ApproveInput): Promise<LedgerEntry> {
      if (!input.approver.trim()) throw new Error('approver is required');
      const base = await requireEntry(ledger, entryId);
      // 差戻し: 元 state を据え置き、理由を approval.basis に残す新版。
      return appendVersion(base, base.state, { approver: input.approver, approvedAt: clock(), basis: `差戻し: ${input.basis}` });
    },
    async requestMoreInfo(entryId: string, input: ApproveInput): Promise<LedgerEntry> {
      if (!input.approver.trim()) throw new Error('approver is required');
      const base = await requireEntry(ledger, entryId);
      return appendVersion(base, 'unverified', { approver: input.approver, approvedAt: clock(), basis: `追加調査: ${input.basis}` });
    },
  };
}
```

- [ ] **Step 4: GREEN + typecheck** — `pnpm --filter @oip/decision test && pnpm --filter @oip/decision typecheck` → PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/decision/src/delivery packages/decision/src/services/approvalService.ts packages/decision/test/approvalService.test.ts
git -c commit.gpgsign=false commit -m "feat(decision): ApprovalService(人間承認でのみapproved_decision)とfake配信を追加"
```

---

### Task 6: `ReviewPacket` builder

**Files:**

- Create: `packages/decision/src/services/reviewPacket.ts`
- Test: `packages/decision/test/reviewPacket.test.ts`

**Interfaces:**

- Consumes: `LedgerRepository`, `LedgerEntry`（Task 1-3）。
- Produces: `buildReviewPacket(ledger, entryId): Promise<ReviewPacket>`
  - `ReviewPacket = { thirtySeconds: { subject; recommendation }; threeMinutes: { background; options; dissent }; source: SourceRef[]; operations: string[] }`
  - `operations = ['approve','approveWithConditions','reject','requestMoreInfo']`

- [ ] **Step 1: テスト**

`packages/decision/test/reviewPacket.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createInMemoryLedger } from '../src/ledger/inMemoryLedger.js';
import { buildReviewPacket } from '../src/services/reviewPacket.js';
import type { AppendInput } from '../src/index.js';

function counter() { let n = 0; return () => `e${++n}`; }
const entry: AppendInput = {
  meetingId: 'm1', kind: 'agreement', state: 'ai_inferred',
  payload: { id: 'a1', kind: 'agreement', meetingId: 'm1', text: 'X で合意',
    basis: [{ meetingId: 'm1', utteranceId: 'u1', speaker: 'Alice', text: '合意: X' }], state: 'ai_inferred' },
  owner: 'system', recordedAt: '2026-07-11T00:00:00.000Z',
};

describe('buildReviewPacket', () => {
  it('三層データと操作を組み立て、原本(basis)を含める', async () => {
    const ledger = createInMemoryLedger(counter());
    const e = await ledger.append({ ...entry });
    const p = await buildReviewPacket(ledger, e.id);
    expect(p.thirtySeconds.subject).toBe('X で合意');
    expect(p.source).toEqual(entry.payload.basis);
    expect(p.operations).toEqual(['approve', 'approveWithConditions', 'reject', 'requestMoreInfo']);
  });
  it('存在しない entry は throw', async () => {
    const ledger = createInMemoryLedger(counter());
    await expect(buildReviewPacket(ledger, 'nope')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: RED** — `pnpm --filter @oip/decision test reviewPacket` → FAIL。

- [ ] **Step 3: implement**

`packages/decision/src/services/reviewPacket.ts`:

```ts
import type { LedgerRepository } from '../ports.js';
import type { SourceRef, InformationState } from '../types.js';

export interface ReviewPacket {
  thirtySeconds: { subject: string; recommendation: string };
  threeMinutes: { background: string; options: string[]; dissent: string[] };
  source: SourceRef[];
  operations: string[];
}

// docs/08 の三層 + Review Packet データ (UI は非対象、構造のみ)。
export async function buildReviewPacket(ledger: LedgerRepository, entryId: string): Promise<ReviewPacket> {
  const e = await ledger.get(entryId);
  if (!e) throw new Error(`ledger entry not found: ${entryId}`);
  const rec: Record<InformationState, string> = {
    ai_inferred: 'AI推定のため人間確認が必要', hypothesis: '仮説段階', human_reported: '人間報告',
    confirmed_fact: '確認済み事実', approved_decision: '承認済み', unverified: '追加調査中', conflicted: '矛盾あり',
  };
  return {
    thirtySeconds: { subject: e.payload.text, recommendation: rec[e.state] },
    threeMinutes: { background: `会議 ${e.meetingId} の${e.kind}候補`, options: [], dissent: [] },
    source: e.payload.basis,
    operations: ['approve', 'approveWithConditions', 'reject', 'requestMoreInfo'],
  };
}
```

- [ ] **Step 4: GREEN + typecheck** — PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/decision/src/services/reviewPacket.ts packages/decision/test/reviewPacket.test.ts
git -c commit.gpgsign=false commit -m "feat(decision): ReviewPacket builder(三層データ+操作)を追加"
```

---

### Task 7: 統合テスト + index 公開

**Files:**

- Modify: `packages/decision/src/index.ts`（新モジュールを re-export）
- Test: `packages/decision/test/integration.test.ts`

**Interfaces:**

- Consumes: 全 Task の公開 API。
- Produces: index.ts が `extract/markerExtractor.js`, `ledger/inMemoryLedger.js`, `ledger/jsonFileLedger.js`, `delivery/fakeDelivery.js`, `services/*.js` を re-export。

- [ ] **Step 1: index 追記 + 統合テスト**

`packages/decision/src/index.ts` に追記:

```ts
export * from './extract/markerExtractor.js';
export * from './ledger/inMemoryLedger.js';
export * from './ledger/jsonFileLedger.js';
export * from './delivery/fakeDelivery.js';
export * from './services/ingestMeetingService.js';
export * from './services/approvalService.js';
export * from './services/reviewPacket.js';
```

`packages/decision/test/integration.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  markerExtractor, createInMemoryLedger, createFakeDelivery,
  createIngestMeetingService, createApprovalService, buildReviewPacket,
} from '../src/index.js';
import { sampleTranscript } from './fixtures/transcript.js';

function counter() { let n = 0; return () => `e${++n}`; }
const clock = () => '2026-07-11T00:00:00.000Z';

describe('Meeting→Decision→Delivery 縦断', () => {
  it('transcript→ingest→review→approve→decision(+task delivery)', async () => {
    const ledger = createInMemoryLedger(counter());
    const delivery = createFakeDelivery();
    const ingest = createIngestMeetingService({ extract: markerExtractor, ledger, clock });
    const approvals = createApprovalService({ ledger, delivery, clock });

    const { entries } = await ingest.ingest(sampleTranscript);
    expect(entries.every((e) => e.state === 'ai_inferred')).toBe(true);

    const agreement = entries.find((e) => e.kind === 'agreement')!;
    const packet = await buildReviewPacket(ledger, agreement.id);
    expect(packet.operations).toContain('approve');

    const decision = await approvals.approve(agreement.id, { approver: 'alice@example.com', basis: '議事録 u1' });
    expect(decision.state).toBe('approved_decision');
    expect(decision.supersedes).toBe(agreement.id);

    const taskEntry = entries.find((e) => e.kind === 'task')!;
    await approvals.approve(taskEntry.id, { approver: 'alice@example.com', basis: 'ok' });
    expect(delivery.delivered.length).toBe(1);

    // AI 経路では approved_decision が存在しないこと (ingest 直後)
    const all = await ledger.getByMeeting('m1');
    const aiDecisions = all.filter((e) => e.state === 'approved_decision' && !e.approval);
    expect(aiDecisions.length).toBe(0);
  });
});
```

- [ ] **Step 2: RED→GREEN** — `pnpm --filter @oip/decision test integration` を実行（index 追記で解決）。全体 `pnpm --filter @oip/decision test && pnpm --filter @oip/decision typecheck` PASS。

- [ ] **Step 3: Commit**

```bash
git add packages/decision/src/index.ts packages/decision/test/integration.test.ts
git -c commit.gpgsign=false commit -m "test(decision): Meeting→Decision→Delivery縦断の統合テストを追加"
```

---

### Task 8: `apps/ingest-func` への配線

**Files:**

- Create: `apps/ingest-func/src/composition.ts`
- Create: `apps/ingest-func/src/functions/decisions.ts`
- Modify: `apps/ingest-func/src/functions/onEvent.ts`（transcript 抽出関数を追加）
- Modify: `apps/ingest-func/src/index.ts`（decisions 関数登録 + onEvent で ingest 呼び出し）
- Modify: `apps/ingest-func/package.json`（`@oip/decision` 依存追加）
- Test: `apps/ingest-func/test/decisions.test.ts`, `apps/ingest-func/test/onEvent.test.ts`（追記）

**Interfaces:**

- Consumes: `@oip/decision` の services/adapters。
- Produces:
  - `composition.ts`: `buildDecisionServices(): { ingest; approvals }`（markerExtractor + jsonFileLedger(env `LEDGER_PATH` or 既定) + fakeDelivery）。
  - `decisions.ts`: `parseApproveRequest(id: string, body: unknown): { ok: true; value: { id; approver; basis } } | { ok: false; error: string }`（純粋・テスト対象）。
  - `onEvent.ts`: `toTranscript(ev: EventEnvelope, message: unknown): Transcript | null`（純粋・テスト対象）。

- [ ] **Step 1: 依存追加 + テスト**

`apps/ingest-func/package.json` の dependencies に `"@oip/decision": "workspace:*"` を追加。
`apps/ingest-func/test/decisions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseApproveRequest } from '../src/functions/decisions.js';

describe('parseApproveRequest', () => {
  it('id と approver/basis を検証して取り出す', () => {
    const r = parseApproveRequest('e1', { approver: 'a@x', basis: 'b' });
    expect(r).toEqual({ ok: true, value: { id: 'e1', approver: 'a@x', basis: 'b' } });
  });
  it('approver 欠落は拒否 (人間承認必須)', () => {
    expect(parseApproveRequest('e1', { basis: 'b' }).ok).toBe(false);
  });
  it('body が object でなければ拒否', () => {
    expect(parseApproveRequest('e1', null).ok).toBe(false);
  });
});
```

`apps/ingest-func/test/onEvent.test.ts` に追記:

```ts
import { toTranscript } from '../src/functions/onEvent.js';

describe('toTranscript', () => {
  it('meeting.ended + transcript を Transcript に変換', () => {
    const t = toTranscript(
      { id: 'e1', type: 'meeting.ended', occurredAt: '' },
      { transcript: { meetingId: 'm1', utterances: [{ id: 'u1', speaker: 'A', text: '合意: X' }] } },
    );
    expect(t?.meetingId).toBe('m1');
  });
  it('type違い/transcript無しは null', () => {
    expect(toTranscript({ id: 'e1', type: 'other', occurredAt: '' }, {})).toBeNull();
    expect(toTranscript({ id: 'e1', type: 'meeting.ended', occurredAt: '' }, {})).toBeNull();
  });
});
```

- [ ] **Step 2: RED** — `pnpm --filter @oip/ingest-func test` → 新規テスト FAIL。

- [ ] **Step 3: implement**

`apps/ingest-func/src/composition.ts`:

```ts
import { markerExtractor, createJsonFileLedger, createFakeDelivery, createIngestMeetingService, createApprovalService } from '@oip/decision';

let seq = 0;
const idgen = () => `led-${Date.now()}-${++seq}`;
const clock = () => new Date().toISOString();

export function buildDecisionServices(ledgerPath = process.env.LEDGER_PATH ?? '/tmp/oip-ledger.jsonl') {
  const ledger = createJsonFileLedger(ledgerPath, idgen);
  const delivery = createFakeDelivery();
  return {
    ingest: createIngestMeetingService({ extract: markerExtractor, ledger, clock }),
    approvals: createApprovalService({ ledger, delivery, clock }),
  };
}
```

`apps/ingest-func/src/functions/decisions.ts`:

```ts
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { buildDecisionServices } from '../composition.js';

export type ApproveParse =
  | { ok: true; value: { id: string; approver: string; basis: string } }
  | { ok: false; error: string };

export function parseApproveRequest(id: string, body: unknown): ApproveParse {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'body must be an object' };
  const b = body as Record<string, unknown>;
  if (typeof b.approver !== 'string' || !b.approver.trim()) return { ok: false, error: 'approver required' };
  const basis = typeof b.basis === 'string' ? b.basis : '';
  return { ok: true, value: { id, approver: b.approver, basis } };
}

export async function decisionsApproveHandler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  const id = req.params.id ?? '';
  const parsed = parseApproveRequest(id, await req.json().catch(() => null));
  if (!parsed.ok) return { status: 400, jsonBody: { error: parsed.error } };
  const { approvals } = buildDecisionServices();
  const decision = await approvals.approve(parsed.value.id, { approver: parsed.value.approver, basis: parsed.value.basis });
  return { status: 200, jsonBody: decision };
}
```

`apps/ingest-func/src/functions/onEvent.ts` に追記（既存 parseEvent/onEventHandler は残す）:

```ts
import type { Transcript } from '@oip/decision';

export function toTranscript(ev: EventEnvelope, message: unknown): Transcript | null {
  if (ev.type !== 'meeting.ended') return null;
  const m = message as { transcript?: unknown };
  const t = m?.transcript as Transcript | undefined;
  if (!t || typeof t.meetingId !== 'string' || !Array.isArray(t.utterances)) return null;
  return t;
}
```

`apps/ingest-func/src/functions/onEvent.ts` の `onEventHandler` を、既存の検証・ログを維持したまま ingest 呼び出しを足す形へ更新する（`toTranscript` は同ファイルに定義済み。ファイル冒頭に `import { buildDecisionServices } from '../composition.js';` を追加。`InvocationContext` の import は既存を流用）:

```ts
export async function onEventHandler(message: unknown, ctx: InvocationContext): Promise<void> {
  const parsed = parseEvent(message);
  if (!parsed.ok) {
    ctx.error(`invalid event dropped: ${parsed.error}`);
    return;
  }
  ctx.log(`event received: ${parsed.value.type} (${parsed.value.id})`);
  const transcript = toTranscript(parsed.value, message);
  if (transcript) {
    const { ingest } = buildDecisionServices();
    const { entries } = await ingest.ingest(transcript);
    ctx.log(`ingested ${entries.length} candidates for meeting ${transcript.meetingId}`);
  }
}
```

`apps/ingest-func/src/index.ts` は既存の `app.http('health'...)` と `app.serviceBusQueue('onEvent'...)` 登録を残し、末尾に decisions の HTTP 登録のみ追加する:

```ts
import { decisionsApproveHandler } from './functions/decisions.js';

app.http('decisions-approve', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'decisions/{id}/approve',
  handler: decisionsApproveHandler,
});
```

- [ ] **Step 4: GREEN + typecheck + build**

Run: `pnpm --filter @oip/ingest-func test && pnpm --filter @oip/ingest-func typecheck && pnpm --filter @oip/ingest-func build`
Expected: 全 PASS、dist 生成。

- [ ] **Step 5: Commit**

```bash
git add apps/ingest-func pnpm-lock.yaml
git -c commit.gpgsign=false commit -m "feat(ingest-func): decision services を配線(onEvent ingest / approve HTTP)"
```

---

## 完了後の全体検証（DoD）

```bash
export PATH="$HOME/.local/bin:$HOME/go/bin:$PATH"
pnpm install
pnpm -r typecheck && pnpm -r test && pnpm -r build
make security && make validate && make bicep
```

Expected: 全 PASS。統合テストで「AI は候補まで、決定は人間承認経由」が実証される。実クラウド/M365/LLM 接続は対象外。

## 備考

- `@oip/decision` の ledger/services は DI（clock/idgen）でテスト決定論。実 adapter（Foundry/Planner）は将来 port 実装として差し込む。
- ingest-func は本フェーズで `@oip/decision`（→`@oip/core`）へ依存する（A フェーズの非依存制約はここで解除）。
