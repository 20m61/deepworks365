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
