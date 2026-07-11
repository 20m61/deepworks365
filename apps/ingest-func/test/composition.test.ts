import { describe, expect, it } from 'vitest';
import { buildDecisionServices } from '../src/composition.js';

describe('buildDecisionServices', () => {
  it('LEDGER_PATH 未設定なら fail-closed (PII を /tmp へ平文保存しない: ルール10)', () => {
    expect(() => buildDecisionServices(undefined)).toThrow(/LEDGER_PATH/);
  });
  it('明示された保存先があれば台帳サービスを構築する', () => {
    const svc = buildDecisionServices('/tmp/test-oip-ledger.jsonl');
    expect(svc.ingest.ingest).toBeTypeOf('function');
    expect(svc.approvals.approve).toBeTypeOf('function');
  });
});
