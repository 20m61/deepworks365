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
