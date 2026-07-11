import type { LedgerRepository, AppendInput } from '../ports.js';
import type { LedgerEntry } from '../types.js';

export function buildEntry(entries: LedgerEntry[], id: string, input: AppendInput): LedgerEntry {
  // 非交渉ルール2,4: approved_decision は approval メタ無しに作れない (構造的強制)。
  if (input.state === 'approved_decision' && !input.approval) {
    throw new Error('approved_decision requires approval meta (非交渉ルール2,4)');
  }
  let version = 1;
  if (input.supersedes) {
    const prev = entries.find((e) => e.id === input.supersedes);
    if (!prev) throw new Error(`supersedes references unknown entry: ${input.supersedes}`);
    version = prev.version + 1;
  }
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
