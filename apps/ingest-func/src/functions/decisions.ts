import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { buildDecisionServices } from '../composition.js';

// Easy Auth が注入する認証済み呼び出し元の安定ID (Entra oid/sub)。
// 非交渉ルール2,4: 承認者は認証コンテキストで決まる。body の自己申告は信頼しない。
export function extractApprover(headers: Pick<Headers, 'get'>): string | null {
  const id = headers.get('x-ms-client-principal-id');
  if (typeof id !== 'string' || !id.trim()) return null;
  return id.trim();
}

export type ApproveBodyParse =
  | { ok: true; value: { basis: string } }
  | { ok: false; error: string };

// 非交渉ルール3/7: 未信頼入力から basis (根拠) のみ検証して取り出す。approver は body から取らない。
export function parseApproveBody(body: unknown): ApproveBodyParse {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'body must be an object' };
  const b = body as Record<string, unknown>;
  if (typeof b.basis !== 'string' || !b.basis.trim()) return { ok: false, error: 'basis required' };
  return { ok: true, value: { basis: b.basis } };
}

// approve 失敗時の HTTP ステータス分類 (純関数)。
// 未知/インフラ障害 (throttling・認証・DNS等の SDK リトライ後失敗) を 409 (Conflict) へ丸めない。
// retry層は 409 を「終端」と扱うため、誤分類はリトライを阻害する。
export function approveErrorStatus(message: string): number {
  if (message.includes('not found')) return 404;
  if (
    message.includes('no longer head') ||
    message.includes('繰り上が') || // requireHead: "既に新版へ繰り上がっている"
    message.includes('承認対象ではない') // issue not approvable
  ) {
    return 409;
  }
  return 500;
}

export async function decisionsApproveHandler(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  const id = req.params.id ?? '';
  // 認証済み呼び出し元にのみ承認を許す (匿名 approve を拒否)。
  const approver = extractApprover(req.headers);
  if (!approver) return { status: 401, jsonBody: { error: 'authenticated caller required' } };
  const parsed = parseApproveBody(await req.json().catch(() => null));
  if (!parsed.ok) return { status: 400, jsonBody: { error: parsed.error } };
  try {
    const { approvals } = buildDecisionServices();
    const decision = await approvals.approve(id, { approver, basis: parsed.value.basis });
    ctx.log(`approved ledger entry ${id}`); // approver (PII) はログしない (ルール10)
    return { status: 200, jsonBody: decision };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'approval failed';
    ctx.error(`approve failed for entry ${id}: ${message}`);
    const status = approveErrorStatus(message);
    return { status, jsonBody: { error: message } };
  }
}
