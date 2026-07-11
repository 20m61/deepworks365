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

export function buildDecisionServices(ledgerPath = process.env.LEDGER_PATH ?? '/tmp/oip-ledger.jsonl') {
  const ledger = createJsonFileLedger(ledgerPath, idgen);
  const delivery = createFakeDelivery();
  return {
    ingest: createIngestMeetingService({ extract: markerExtractor, ledger, clock }),
    approvals: createApprovalService({ ledger, delivery, clock }),
  };
}
