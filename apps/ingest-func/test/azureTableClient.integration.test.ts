import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TableClient } from '@azure/data-tables';
import type { AppendInput } from '@oip/decision';
import { createTableLedger } from '@oip/decision';
import { createAzureTableClient } from '../src/ledger/azureTableClient.js';

// 実 Azurite への統合テスト。既定の pre-push ゲート(pnpm -r test)ではスキップし、
// Azurite 起動時に AZURITE_TABLE_TEST=1 で明示実行する（オフライン fake が符号化した
// Table セマンティクス — ETag トランザクションの 412 と SDK マッピング — を実SDK/実storageで検証）。
//   docker run -d -p 10002:10002 mcr.microsoft.com/azure-storage/azurite azurite-table --tableHost 0.0.0.0
//   AZURITE_TABLE_TEST=1 pnpm --filter @oip/ingest-func test -- azureTableClient.integration
const CONNECTION = 'UseDevelopmentStorage=true';
const enabled = process.env.AZURITE_TABLE_TEST === '1';
const table = `oipit${Date.now()}`;

let idseq = 0;
const idgen = () => `led-${Date.now()}-${++idseq}`;
const clock = () => new Date().toISOString();

const candidate: AppendInput = {
  meetingId: 'm1', kind: 'agreement', state: 'ai_inferred',
  payload: { id: 'a1', kind: 'agreement', meetingId: 'm1', text: 'X で合意', basis: [], state: 'ai_inferred' },
  owner: 'system', recordedAt: clock(),
};
const approve = (supersedes: string): AppendInput => ({
  ...candidate, state: 'approved_decision', supersedes,
  approval: { approver: 'oid-123', approvedAt: clock(), basis: '議事録 u1' },
});

describe.skipIf(!enabled)('azureTableClient + createTableLedger against Azurite', () => {
  const ledger = createTableLedger(createAzureTableClient(table, { LEDGER_TABLE_CONNECTION_STRING: CONNECTION }), idgen);

  beforeAll(async () => {
    // シムはテーブルを作らないため、事前に作成する。
    await TableClient.fromConnectionString(CONNECTION, table).createTable();
  });
  afterAll(async () => {
    await TableClient.fromConnectionString(CONNECTION, table).deleteTable();
  });

  it('候補を append し get / getByMeeting で往復できる（JSON複合フィールド含む）', async () => {
    const e = await ledger.append({ ...candidate });
    expect(e.version).toBe(1);
    const got = await ledger.get(e.id);
    expect(got).toEqual(e); // payload/basis 等の JSON 往復が無損失
    expect((await ledger.getByMeeting('m1')).some((x) => x.id === e.id)).toBe(true);
  });

  it('supersede で approved_decision 新版が version=2 で作られる', async () => {
    const base = await ledger.append({ ...candidate, meetingId: 'm2', payload: { ...candidate.payload, meetingId: 'm2' } });
    const decided = await ledger.append({ ...approve(base.id), meetingId: 'm2', payload: { ...candidate.payload, meetingId: 'm2', state: 'approved_decision' } });
    expect(decided.state).toBe('approved_decision');
    expect(decided.version).toBe(2);
    expect(decided.supersedes).toBe(base.id);
  });

  it('同一 base への並行 supersede は実 ETag トランザクションで後発を拒否する（rule7）', async () => {
    const base = await ledger.append({ ...candidate, meetingId: 'm3', payload: { ...candidate.payload, meetingId: 'm3' } });
    const a = approve(base.id); const b = approve(base.id);
    const results = await Promise.allSettled([
      ledger.append({ ...a, meetingId: 'm3', payload: { ...candidate.payload, meetingId: 'm3', state: 'approved_decision' } }),
      ledger.append({ ...b, meetingId: 'm3', payload: { ...candidate.payload, meetingId: 'm3', state: 'approved_decision' } }),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toMatch(/no longer head|concurrent/);
    // base を supersede したのは実際に1エントリだけ。
    const supersederCount = (await ledger.getByMeeting('m3')).filter((x) => x.supersedes === base.id).length;
    expect(supersederCount).toBe(1);
  });
});
