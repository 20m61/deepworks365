import type { LedgerRepository, DeliveryPort } from '../ports.js';
import type { LedgerEntry, ApprovalMeta, InformationState, TaskCandidate, DeliveryRef } from '../types.js';

export interface ApprovalDeps { ledger: LedgerRepository; delivery: DeliveryPort; clock: () => string; }
export interface ApproveInput { approver: string; basis: string; conditions?: string; }

async function requireEntry(ledger: LedgerRepository, entryId: string): Promise<LedgerEntry> {
  const e = await ledger.get(entryId);
  if (!e) throw new Error(`ledger entry not found: ${entryId}`);
  return e;
}

export function createApprovalService(deps: ApprovalDeps) {
  const { ledger, delivery, clock } = deps;

  // 人間承認の唯一の入口。approved_decision はここでのみ生成される (非交渉ルール2,4)。
  async function appendVersion(base: LedgerEntry, state: InformationState, approval?: ApprovalMeta, deliveryRef?: DeliveryRef): Promise<LedgerEntry> {
    return ledger.append({
      meetingId: base.meetingId, kind: base.kind, state,
      payload: { ...base.payload, state }, owner: base.owner,
      recordedAt: clock(), supersedes: base.id, approval, deliveryRef,
    });
  }

  async function decide(entryId: string, input: ApproveInput, conditions?: string): Promise<LedgerEntry> {
    if (!input.approver.trim()) throw new Error('approver is required (人間承認必須)');
    const base = await requireEntry(ledger, entryId);
    if (base.kind === 'issue') throw new Error('issue は承認対象ではない');
    const approval: ApprovalMeta = { approver: input.approver, approvedAt: clock(), basis: input.basis, ...(conditions ? { conditions } : {}) };
    if (base.kind === 'task') {
      const ref = await delivery.deliver(base.payload as TaskCandidate);
      return appendVersion(base, 'approved_decision', approval, ref);
    }
    return appendVersion(base, 'approved_decision', approval);
  }

  return {
    approve: (entryId: string, input: ApproveInput) => decide(entryId, input),
    approveWithConditions: (entryId: string, input: ApproveInput & { conditions: string }) => decide(entryId, input, input.conditions),
    async reject(entryId: string, input: ApproveInput): Promise<LedgerEntry> {
      if (!input.approver.trim()) throw new Error('approver is required');
      const base = await requireEntry(ledger, entryId);
      // 差戻し: 元 state を据え置き、理由を approval.basis に残す新版。
      return appendVersion(base, base.state, { approver: input.approver, approvedAt: clock(), basis: `差戻し: ${input.basis}` });
    },
    async requestMoreInfo(entryId: string, input: ApproveInput): Promise<LedgerEntry> {
      if (!input.approver.trim()) throw new Error('approver is required');
      const base = await requireEntry(ledger, entryId);
      return appendVersion(base, 'unverified', { approver: input.approver, approvedAt: clock(), basis: `追加調査: ${input.basis}` });
    },
  };
}
