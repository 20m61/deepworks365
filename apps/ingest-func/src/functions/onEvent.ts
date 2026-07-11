import type { InvocationContext } from '@azure/functions';
import type { Transcript } from '@oip/decision';
import { buildDecisionServices } from '../composition.js';

export interface EventEnvelope {
  id: string;
  type: string;
  occurredAt: string;
}

export type ParseResult =
  | { ok: true; value: EventEnvelope }
  | { ok: false; error: string };

// 非交渉ルール3: 未信頼入力を検証し、命令として実行しない。
export function parseEvent(message: unknown): ParseResult {
  if (typeof message !== 'object' || message === null) {
    return { ok: false, error: 'message must be an object' };
  }
  const m = message as Record<string, unknown>;
  if (typeof m.id !== 'string' || m.id.length === 0) {
    return { ok: false, error: 'id required' };
  }
  if (typeof m.type !== 'string' || m.type.length === 0) {
    return { ok: false, error: 'type required' };
  }
  const occurredAt = typeof m.occurredAt === 'string' ? m.occurredAt : '';
  return { ok: true, value: { id: m.id, type: m.type, occurredAt } };
}

// 未信頼な message から Transcript を安全に取り出す (純粋・テスト対象)。
export function toTranscript(ev: EventEnvelope, message: unknown): Transcript | null {
  if (ev.type !== 'meeting.ended') return null;
  const m = message as { transcript?: unknown };
  const t = m?.transcript as Transcript | undefined;
  if (!t || typeof t.meetingId !== 'string' || !Array.isArray(t.utterances)) return null;
  return t;
}

export async function onEventHandler(
  message: unknown,
  ctx: InvocationContext,
): Promise<void> {
  const parsed = parseEvent(message);
  if (!parsed.ok) {
    ctx.error(`invalid event dropped: ${parsed.error}`);
    return; // 検証失敗はログのみで打ち切る
  }
  ctx.log(`event received: ${parsed.value.type} (${parsed.value.id})`);
  const transcript = toTranscript(parsed.value, message);
  if (transcript) {
    // AI は候補抽出まで。決定は人間承認 API 経由でのみ行われる (非交渉ルール2)。
    const { ingest } = buildDecisionServices();
    const { entries } = await ingest.ingest(transcript);
    ctx.log(`ingested ${entries.length} candidates for meeting ${transcript.meetingId}`);
  }
}
