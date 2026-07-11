// Table Storage の1エンティティ。複合フィールドは JSON 文字列で格納する。
export interface LedgerTableEntity {
  partitionKey: string;   // = meetingId
  rowKey: string;         // = entry id
  kind: string;
  state: string;
  version: number;
  owner: string;
  recordedAt: string;
  supersedes?: string;
  supersededBy?: string;
  payloadJson: string;
  approvalJson?: string;
  deliveryRefJson?: string;
  etag?: string;          // 楽観ロック用
}

export type TxAction =
  | { op: 'create'; entity: LedgerTableEntity }
  | { op: 'update'; entity: LedgerTableEntity; etag: string };

// アダプタが必要とする Table 操作の最小集合。本番は app 側 shim が実 SDK を包む。
export interface TableClientLike {
  createEntity(entity: LedgerTableEntity): Promise<void>;                 // 既存なら statusCode 409 を throw
  getEntity(partitionKey: string, rowKey: string): Promise<LedgerTableEntity | null>; // 無ければ null
  findByRowKey(rowKey: string): Promise<LedgerTableEntity | null>;        // 横断 RowKey 検索（get(id) 用）
  listByPartition(partitionKey: string): Promise<LedgerTableEntity[]>;
  submitTransaction(actions: TxAction[]): Promise<void>;                  // update の etag 不一致で statusCode 412 を throw
}

import type { LedgerRepository, AppendInput } from '../ports.js';
import type { LedgerEntry } from '../types.js';
import { buildEntry } from './inMemoryLedger.js';

function toEntity(e: LedgerEntry): LedgerTableEntity {
  return {
    partitionKey: e.meetingId, rowKey: e.id, kind: e.kind, state: e.state,
    version: e.version, owner: e.owner, recordedAt: e.recordedAt, supersedes: e.supersedes,
    payloadJson: JSON.stringify(e.payload),
    approvalJson: e.approval ? JSON.stringify(e.approval) : undefined,
    deliveryRefJson: e.deliveryRef ? JSON.stringify(e.deliveryRef) : undefined,
  };
}

function fromEntity(ent: LedgerTableEntity): LedgerEntry {
  return {
    id: ent.rowKey, meetingId: ent.partitionKey,
    kind: ent.kind as LedgerEntry['kind'], state: ent.state as LedgerEntry['state'],
    payload: JSON.parse(ent.payloadJson) as LedgerEntry['payload'],
    version: ent.version, owner: ent.owner, recordedAt: ent.recordedAt, supersedes: ent.supersedes,
    approval: ent.approvalJson ? JSON.parse(ent.approvalJson) : undefined,
    deliveryRef: ent.deliveryRefJson ? JSON.parse(ent.deliveryRefJson) : undefined,
  };
}

export function createTableLedger(client: TableClientLike, idgen: () => string): LedgerRepository {
  return {
    async append(input: AppendInput): Promise<LedgerEntry> {
      const existing = await client.listByPartition(input.meetingId);
      const entry = buildEntry(existing.map(fromEntity), idgen(), input);
      await client.createEntity(toEntity(entry));
      return entry;
    },
    async get(id: string): Promise<LedgerEntry | null> {
      const ent = await client.findByRowKey(id);
      return ent ? fromEntity(ent) : null;
    },
    async getByMeeting(meetingId: string): Promise<LedgerEntry[]> {
      return (await client.listByPartition(meetingId)).map(fromEntity);
    },
  };
}
