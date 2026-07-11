import { describe, expect, it } from 'vitest';
import { createTableLedger } from '../src/ledger/tableLedger.js';
import { createFakeTableClient } from './support/fakeTableClient.js';
import { runLedgerContract, counter } from './support/ledgerContract.js';
import type { AppendInput } from '../src/index.js';

runLedgerContract('tableLedger', () => createTableLedger(createFakeTableClient(), counter()));

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
