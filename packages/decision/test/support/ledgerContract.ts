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
