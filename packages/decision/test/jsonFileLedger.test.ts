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
