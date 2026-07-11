import { TableClient, odata, type TableEntity } from '@azure/data-tables';
import { DefaultAzureCredential } from '@azure/identity';
import type { LedgerTableEntity, TableClientLike, TxAction } from '@oip/decision';

// 実 @azure/data-tables を TableClientLike へ写す薄い shim。
// SDK セマンティクス整合は後続の Azurite 統合テストで検証（本 slice ではオフライン非対象の委譲 seam）。
export function createAzureTableClient(table: string, env: NodeJS.ProcessEnv): TableClientLike {
  const cs = env.LEDGER_TABLE_CONNECTION_STRING;
  const endpoint = env.LEDGER_TABLE_ENDPOINT;
  if (!cs && !endpoint?.trim()) {
    throw new Error('LEDGER_TABLE_ENDPOINT or LEDGER_TABLE_CONNECTION_STRING is required for the table ledger');
  }
  const client = cs
    ? TableClient.fromConnectionString(cs, table)
    : new TableClient(endpoint ?? '', table, new DefaultAzureCredential());

  // etag は楽観的並行制御用にトランザクションオプション ({ etag: a.etag }) で個別に渡すため、
  // SDK へ永続化するエンティティ本体からは除去する (二重・不要プロパティの混入防止)。
  const toSdk = (e: LedgerTableEntity): TableEntity => {
    const { etag: _etag, ...rest } = e;
    return rest as unknown as TableEntity;
  };
  const fromSdk = (e: Record<string, unknown>): LedgerTableEntity => e as unknown as LedgerTableEntity;

  return {
    async createEntity(entity) { await client.createEntity(toSdk(entity)); },
    async getEntity(pk, rk) {
      try { return fromSdk(await client.getEntity(pk, rk)); }
      catch (err) { if ((err as { statusCode?: number }).statusCode === 404) return null; throw err; }
    },
    async findByRowKey(rk) {
      for await (const e of client.listEntities({ queryOptions: { filter: odata`RowKey eq ${rk}` } })) return fromSdk(e);
      return null;
    },
    async listByPartition(pk) {
      const out: LedgerTableEntity[] = [];
      for await (const e of client.listEntities({ queryOptions: { filter: odata`PartitionKey eq ${pk}` } })) out.push(fromSdk(e));
      return out;
    },
    async submitTransaction(actions: TxAction[]) {
      await client.submitTransaction(actions.map((a) =>
        a.op === 'create'
          ? ['create', toSdk(a.entity)]
          : ['update', toSdk(a.entity), 'Merge', { etag: a.etag }],
      ));
    },
  };
}
