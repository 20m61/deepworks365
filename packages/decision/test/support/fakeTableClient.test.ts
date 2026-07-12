import { describe, expect, it } from 'vitest';
import { createFakeTableClient } from './fakeTableClient.js';
import type { LedgerTableEntity } from '../../src/ledger/tableLedger.js';

const ent = (pk: string, rk: string): LedgerTableEntity => ({
  partitionKey: pk, rowKey: rk, kind: 'agreement', state: 'ai_inferred',
  version: 1, owner: 'system', recordedAt: 't', payloadJson: '{}',
});

describe('fakeTableClient', () => {
  it('createEntity 重複は 409', async () => {
    const c = createFakeTableClient();
    await c.createEntity(ent('m1', 'r1'));
    await expect(c.createEntity(ent('m1', 'r1'))).rejects.toMatchObject({ statusCode: 409 });
  });
  it('submitTransaction は古い etag で 412', async () => {
    const c = createFakeTableClient();
    await c.createEntity(ent('m1', 'base'));
    await expect(c.submitTransaction([
      { op: 'update', entity: ent('m1', 'base'), etag: 'W/"stale"' },
    ])).rejects.toMatchObject({ statusCode: 412 });
  });
  it('submitTransaction は正しい etag で成功し etag を進める', async () => {
    const c = createFakeTableClient();
    await c.createEntity(ent('m1', 'base'));
    const cur = await c.getEntity('m1', 'base');
    await c.submitTransaction([{ op: 'update', entity: { ...cur!, supersededBy: 'x' }, etag: cur!.etag! }]);
    const after = await c.getEntity('m1', 'base');
    expect(after!.supersededBy).toBe('x');
    expect(after!.etag).not.toBe(cur!.etag);
  });
  it('beforeSubmit は submit 前に1回呼ばれる', async () => {
    const c = createFakeTableClient();
    let called = 0;
    c.beforeSubmit = async () => { called++; };
    await c.createEntity(ent('m1', 'r1'));
    const cur = await c.getEntity('m1', 'r1');
    await c.submitTransaction([{ op: 'update', entity: cur!, etag: cur!.etag! }]);
    expect(called).toBe(1);
  });
});
