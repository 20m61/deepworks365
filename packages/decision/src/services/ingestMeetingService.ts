import type { ExtractPort, LedgerRepository } from '../ports.js';
import type { Transcript, Candidate, LedgerEntry } from '../types.js';

export interface IngestDeps { extract: ExtractPort; ledger: LedgerRepository; clock: () => string; owner?: string; }

export function createIngestMeetingService(deps: IngestDeps) {
  const owner = deps.owner ?? 'system';
  return {
    // AI は候補まで。決定はしない (非交渉ルール2)。
    async ingest(t: Transcript): Promise<{ entries: LedgerEntry[]; deduped: boolean }> {
      // 非交渉ルール9: Service Bus 再配信に対し meetingId 単位で冪等。
      // 既に取り込み済みなら新規 append せず既存を返す。
      const existing = await deps.ledger.getByMeeting(t.meetingId);
      if (existing.length > 0) return { entries: existing, deduped: true };
      const r = await deps.extract.extract(t);
      const candidates: Candidate[] = [...r.agreements, ...r.tasks, ...r.issues];
      const entries: LedgerEntry[] = [];
      for (const c of candidates) {
        entries.push(await deps.ledger.append({
          meetingId: c.meetingId, kind: c.kind, state: 'ai_inferred',
          payload: c, owner, recordedAt: deps.clock(),
        }));
      }
      return { entries, deduped: false };
    },
  };
}
