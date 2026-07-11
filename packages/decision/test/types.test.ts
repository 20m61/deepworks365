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
