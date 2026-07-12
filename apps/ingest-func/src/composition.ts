import {
  markerExtractor,
  createJsonFileLedger,
  createTableLedger,
  createFakeDelivery,
  createIngestMeetingService,
  createApprovalService,
  type LedgerRepository,
} from '@oip/decision';
import { createAzureTableClient } from './ledger/azureTableClient.js';

let seq = 0;
const idgen = () => `led-${Date.now()}-${++seq}`;
const clock = () => new Date().toISOString();

export type LedgerKind = { kind: 'table'; table: string } | { kind: 'file'; path: string };

// 非交渉ルール10: 保存先が明示されなければ /tmp 等へ平文で書かず fail-closed。
export function resolveLedgerKind(env: NodeJS.ProcessEnv): LedgerKind {
  const table = env.LEDGER_TABLE?.trim();
  if (table) return { kind: 'table', table };
  const path = env.LEDGER_PATH?.trim();
  if (path) return { kind: 'file', path };
  throw new Error('LEDGER_TABLE or LEDGER_PATH is not configured: refuse to persist approval PII to an insecure default');
}

export type DecisionServices = {
  ingest: ReturnType<typeof createIngestMeetingService>;
  approvals: ReturnType<typeof createApprovalService>;
};

// Azure Functions のベストプラクティス: TableClient と DefaultAzureCredential(トークンキャッシュ)は
// リクエスト毎に作り直さず、インスタンス内で再利用する。解決済み設定単位でサービスをメモ化する。
const servicesCache = new Map<string, DecisionServices>();

function createDecisionServices(env: NodeJS.ProcessEnv, cfg: LedgerKind): DecisionServices {
  const ledger: LedgerRepository = cfg.kind === 'table'
    ? createTableLedger(createAzureTableClient(cfg.table, env), idgen)
    : createJsonFileLedger(cfg.path, idgen);
  const delivery = createFakeDelivery();
  return {
    ingest: createIngestMeetingService({ extract: markerExtractor, ledger, clock }),
    approvals: createApprovalService({ ledger, delivery, clock }),
  };
}

export function buildDecisionServices(env: NodeJS.ProcessEnv = process.env): DecisionServices {
  const cfg = resolveLedgerKind(env); // 未設定はここで fail-closed (キャッシュ前)
  const key = JSON.stringify(cfg);
  let services = servicesCache.get(key);
  if (!services) {
    services = createDecisionServices(env, cfg);
    servicesCache.set(key, services);
  }
  return services;
}
