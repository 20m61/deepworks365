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
