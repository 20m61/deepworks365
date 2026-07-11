import {
  markerExtractor,
  createJsonFileLedger,
  createFakeDelivery,
  createIngestMeetingService,
  createApprovalService,
} from '@oip/decision';

let seq = 0;
const idgen = () => `led-${Date.now()}-${++seq}`;
const clock = () => new Date().toISOString();

export function buildDecisionServices(ledgerPath = process.env.LEDGER_PATH) {
  // 非交渉ルール10: 承認者を含む PII を平文で /tmp 等へ書かない。
  // 保存先はアクセス制御・暗号化を備えた永続層を明示指定する。未設定は fail-closed。
  // 参照: backlog/issues/026.md (本番前提: 暗号化・アクセス制御を備えた永続層へ移行)
  if (!ledgerPath || !ledgerPath.trim()) {
    throw new Error('LEDGER_PATH is not configured: refuse to persist approval PII to an insecure default');
  }
  const ledger = createJsonFileLedger(ledgerPath, idgen);
  const delivery = createFakeDelivery();
  return {
    ingest: createIngestMeetingService({ extract: markerExtractor, ledger, clock }),
    approvals: createApprovalService({ ledger, delivery, clock }),
  };
}
