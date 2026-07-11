import type { LedgerRepository } from '../ports.js';
import type { SourceRef, InformationState } from '../types.js';

export interface ReviewPacket {
  thirtySeconds: { subject: string; recommendation: string };
  threeMinutes: { background: string; options: string[]; dissent: string[] };
  source: SourceRef[];
  operations: string[];
}

// docs/08 の三層 + Review Packet データ (UI は非対象、構造のみ)。
export async function buildReviewPacket(ledger: LedgerRepository, entryId: string): Promise<ReviewPacket> {
  const e = await ledger.get(entryId);
  if (!e) throw new Error(`ledger entry not found: ${entryId}`);
  const rec: Record<InformationState, string> = {
    ai_inferred: 'AI推定のため人間確認が必要', hypothesis: '仮説段階', human_reported: '人間報告',
    confirmed_fact: '確認済み事実', approved_decision: '承認済み', unverified: '追加調査中', conflicted: '矛盾あり',
  };
  return {
    thirtySeconds: { subject: e.payload.text, recommendation: rec[e.state] },
    threeMinutes: { background: `会議 ${e.meetingId} の${e.kind}候補`, options: [], dissent: [] },
    source: e.payload.basis,
    operations: ['approve', 'approveWithConditions', 'reject', 'requestMoreInfo'],
  };
}
