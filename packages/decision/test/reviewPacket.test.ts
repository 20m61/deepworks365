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
