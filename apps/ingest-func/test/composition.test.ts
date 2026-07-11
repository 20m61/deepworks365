import { describe, expect, it } from 'vitest';
import { buildDecisionServices, resolveLedgerKind } from '../src/composition.js';

describe('resolveLedgerKind', () => {
  it('LEDGER_TABLE 優先で table を選ぶ', () => {
    expect(resolveLedgerKind({ LEDGER_TABLE: 'oipledger', LEDGER_PATH: '/x' })).toEqual({ kind: 'table', table: 'oipledger' });
  });
  it('LEDGER_TABLE 無し・LEDGER_PATH ありは file', () => {
    expect(resolveLedgerKind({ LEDGER_PATH: '/x' })).toEqual({ kind: 'file', path: '/x' });
  });
  it('どちらも無ければ fail-closed (throw)', () => {
    expect(() => resolveLedgerKind({})).toThrow(/LEDGER_TABLE|LEDGER_PATH/);
  });
});

describe('buildDecisionServices', () => {
  it('LEDGER_PATH で台帳サービスを構築する', () => {
    const svc = buildDecisionServices({ LEDGER_PATH: '/tmp/test-oip-ledger.jsonl' });
    expect(svc.ingest.ingest).toBeTypeOf('function');
    expect(svc.approvals.approve).toBeTypeOf('function');
  });
  it('未設定は fail-closed', () => {
    expect(() => buildDecisionServices({})).toThrow(/LEDGER_TABLE|LEDGER_PATH/);
  });
});
