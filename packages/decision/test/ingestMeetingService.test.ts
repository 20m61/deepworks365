import { describe, expect, it } from 'vitest';
import { markerExtractor } from '../src/extract/markerExtractor.js';
import { createInMemoryLedger } from '../src/ledger/inMemoryLedger.js';
import { createIngestMeetingService } from '../src/services/ingestMeetingService.js';
import { sampleTranscript } from './fixtures/transcript.js';

function counter() { let n = 0; return () => `e${++n}`; }
const clock = () => '2026-07-11T00:00:00.000Z';

describe('IngestMeetingService', () => {
  it('抽出候補を ai_inferred で台帳へ記録し、決定は作らない', async () => {
    const ledger = createInMemoryLedger(counter());
    const svc = createIngestMeetingService({ extract: markerExtractor, ledger, clock });
    const { entries } = await svc.ingest(sampleTranscript);
    expect(entries.length).toBe(4); // 1 agreement + 1 task + 2 issue
    expect(entries.every((e) => e.state === 'ai_inferred')).toBe(true);
    expect(entries.some((e) => e.state === 'approved_decision')).toBe(false);
    expect(entries.every((e) => e.recordedAt === '2026-07-11T00:00:00.000Z')).toBe(true);
    expect((await ledger.getByMeeting('m1')).length).toBe(4);
  });

  it('同一 transcript の二重取り込みで台帳エントリを重複生成しない (冪等: 非交渉ルール9)', async () => {
    const ledger = createInMemoryLedger(counter());
    const svc = createIngestMeetingService({ extract: markerExtractor, ledger, clock });
    const first = await svc.ingest(sampleTranscript);
    const second = await svc.ingest(sampleTranscript);
    expect(first.deduped).toBe(false);
    expect(second.deduped).toBe(true);
    // Service Bus 再配信で二度取り込んでも meetingId 単位で重複しない。
    expect((await ledger.getByMeeting('m1')).length).toBe(4);
    expect(second.entries.length).toBe(4); // 既存分を返す
  });
});
