import { describe, expect, it } from 'vitest';
import {
  markerExtractor, createInMemoryLedger, createFakeDelivery,
  createIngestMeetingService, createApprovalService, buildReviewPacket,
} from '../src/index.js';
import { sampleTranscript } from './fixtures/transcript.js';

function counter() { let n = 0; return () => `e${++n}`; }
const clock = () => '2026-07-11T00:00:00.000Z';

describe('Meeting→Decision→Delivery 縦断', () => {
  it('transcript→ingest→review→approve→decision(+task delivery)', async () => {
    const ledger = createInMemoryLedger(counter());
    const delivery = createFakeDelivery();
    const ingest = createIngestMeetingService({ extract: markerExtractor, ledger, clock });
    const approvals = createApprovalService({ ledger, delivery, clock });

    const { entries } = await ingest.ingest(sampleTranscript);
    expect(entries.every((e) => e.state === 'ai_inferred')).toBe(true);

    const agreement = entries.find((e) => e.kind === 'agreement')!;
    const packet = await buildReviewPacket(ledger, agreement.id);
    expect(packet.operations).toContain('approve');

    const decision = await approvals.approve(agreement.id, { approver: 'alice@example.com', basis: '議事録 u1' });
    expect(decision.state).toBe('approved_decision');
    expect(decision.supersedes).toBe(agreement.id);

    const taskEntry = entries.find((e) => e.kind === 'task')!;
    await approvals.approve(taskEntry.id, { approver: 'alice@example.com', basis: 'ok' });
    expect(delivery.delivered.length).toBe(1);

    // 直接 ledger 経由でも approved_decision を偽造できない (rule2,4 構造的強制)
    await expect(
      ledger.append({
        meetingId: 'm1', kind: 'agreement', state: 'approved_decision',
        payload: agreement.payload, owner: 'attacker', recordedAt: clock(),
      }),
    ).rejects.toThrow();
  });
});
