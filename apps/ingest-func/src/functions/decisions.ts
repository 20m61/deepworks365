import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { buildDecisionServices } from '../composition.js';

export type ApproveParse =
  | { ok: true; value: { id: string; approver: string; basis: string } }
  | { ok: false; error: string };

// 非交渉ルール3/4: 未信頼入力を検証し、人間承認を必須とする。
export function parseApproveRequest(id: string, body: unknown): ApproveParse {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'body must be an object' };
  const b = body as Record<string, unknown>;
  if (typeof b.approver !== 'string' || !b.approver.trim()) return { ok: false, error: 'approver required' };
  const basis = typeof b.basis === 'string' ? b.basis : '';
  return { ok: true, value: { id, approver: b.approver, basis } };
}

export async function decisionsApproveHandler(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  const id = req.params.id ?? '';
  const parsed = parseApproveRequest(id, await req.json().catch(() => null));
  if (!parsed.ok) return { status: 400, jsonBody: { error: parsed.error } };
  try {
    const { approvals } = buildDecisionServices();
    const decision = await approvals.approve(parsed.value.id, { approver: parsed.value.approver, basis: parsed.value.basis });
    ctx.log(`approved ledger entry ${parsed.value.id}`); // approver はPII のためログしない (ルール10)
    return { status: 200, jsonBody: decision };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'approval failed';
    ctx.error(`approve failed for entry ${id}: ${message}`);
    const status = message.includes('not found') ? 404 : 409;
    return { status, jsonBody: { error: message } };
  }
}
