import type { InvocationContext } from '@azure/functions';

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
  // 業務ロジック(合意/未決/タスク抽出)は B フェーズ (PoC #25)
}
