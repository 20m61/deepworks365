import type { LedgerTableEntity, TableClientLike } from '../../src/ledger/tableLedger.js';

export interface FakeTableClient extends TableClientLike {
  // submitTransaction 実行直前に1回だけ差し込む並行競合シミュレーション用フック。
  beforeSubmit?: () => Promise<void>;
}

export function createFakeTableClient(): FakeTableClient {
  const store = new Map<string, LedgerTableEntity>();
  let etagSeq = 0;
  const key = (pk: string, rk: string) => `${pk}|${rk}`;
  const nextEtag = () => `W/"${++etagSeq}"`;

  const fake: FakeTableClient = {
    async createEntity(entity) {
      const k = key(entity.partitionKey, entity.rowKey);
      if (store.has(k)) throw Object.assign(new Error('entity exists'), { statusCode: 409 });
      store.set(k, { ...entity, etag: nextEtag() });
    },
    async getEntity(pk, rk) {
      const e = store.get(key(pk, rk));
      return e ? { ...e } : null;
    },
    async findByRowKey(rk) {
      for (const e of store.values()) if (e.rowKey === rk) return { ...e };
      return null;
    },
    async listByPartition(pk) {
      return [...store.values()].filter((e) => e.partitionKey === pk).map((e) => ({ ...e }));
    },
    async submitTransaction(actions) {
      if (fake.beforeSubmit) await fake.beforeSubmit();
      // 事前検証（原子性）: etag 不一致 / 重複 create を先に弾く。
      for (const a of actions) {
        const k = key(a.entity.partitionKey, a.entity.rowKey);
        if (a.op === 'update') {
          const cur = store.get(k);
          if (!cur || cur.etag !== a.etag) throw Object.assign(new Error('precondition failed'), { statusCode: 412 });
        }
        if (a.op === 'create' && store.has(k)) throw Object.assign(new Error('entity exists'), { statusCode: 409 });
      }
      for (const a of actions) {
        const k = key(a.entity.partitionKey, a.entity.rowKey);
        if (a.op === 'create') store.set(k, { ...a.entity, etag: nextEtag() });
        else store.set(k, { ...store.get(k)!, ...a.entity, etag: nextEtag() });
      }
    },
  };
  return fake;
}
