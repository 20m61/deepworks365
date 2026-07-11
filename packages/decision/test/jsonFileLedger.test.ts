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
