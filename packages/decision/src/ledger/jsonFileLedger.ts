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
