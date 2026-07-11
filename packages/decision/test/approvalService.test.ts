import { describe, expect, it } from 'vitest';
import { createInMemoryLedger } from '../src/ledger/inMemoryLedger.js';
import { createFakeDelivery } from '../src/delivery/fakeDelivery.js';
import { createApprovalService } from '../src/services/approvalService.js';
import type { AppendInput } from '../src/index.js';

function counter() { let n = 0; return () => `e${++n}`; }
const clock = () => '2026-07-11T00:00:00.000Z';
const agreement: AppendInput = {
  meetingId: 'm1', kind: 'agreement', state: 'ai_inferred',
  payload: { id: 'a1', kind: 'agreement', meetingId: 'm1', text: 'X で合意', basis: [], state: 'ai_inferred' },
  owner: 'system', recordedAt: clock(),
};
const task: AppendInput = { ...agreement, kind: 'task', payload: { id: 't1', kind: 'task', meetingId: 'm1', text: 'CI設定', basis: [], state: 'ai_inferred' } };

describe('ApprovalService', () => {
  it('approve は approved_decision の新版を承認メタ付きで作る', async () => {
    const ledger = createInMemoryLedger(counter());
    const svc = createApprovalService({ ledger, delivery: createFakeDelivery(), clock });
    const c = await ledger.append({ ...agreement });
    const d = await svc.approve(c.id, { approver: 'alice@example.com', basis: '議事録 u1' });
    expect(d.state).toBe('approved_decision');
    expect(d.version).toBe(2);
    expect(d.supersedes).toBe(c.id);
    expect(d.approval).toEqual({ approver: 'alice@example.com', approvedAt: clock(), basis: '議事録 u1' });
  });
  it('承認者が空なら拒否 (人間承認必須)', async () => {
    const ledger = createInMemoryLedger(counter());
    const svc = createApprovalService({ ledger, delivery: createFakeDelivery(), clock });
    const c = await ledger.append({ ...agreement });
    await expect(svc.approve(c.id, { approver: '', basis: 'x' })).rejects.toThrow();
  });
  it('issue は承認不可', async () => {
    const ledger = createInMemoryLedger(counter());
    const svc = createApprovalService({ ledger, delivery: createFakeDelivery(), clock });
    const c = await ledger.append({ ...agreement, kind: 'issue', payload: { id: 'i1', kind: 'issue', meetingId: 'm1', text: '?', basis: [], state: 'ai_inferred' } });
    await expect(svc.approve(c.id, { approver: 'a', basis: 'x' })).rejects.toThrow();
  });
  it('承認された task は delivery され deliveryRef が記録される', async () => {
    const ledger = createInMemoryLedger(counter());
    const delivery = createFakeDelivery();
    const svc = createApprovalService({ ledger, delivery, clock });
    const c = await ledger.append({ ...task });
    const d = await svc.approve(c.id, { approver: 'a', basis: 'x' });
    expect(delivery.delivered.length).toBe(1);
    expect(d.deliveryRef?.system).toBe('fake');
  });
  it('requestMoreInfo は unverified の新版を作る', async () => {
    const ledger = createInMemoryLedger(counter());
    const svc = createApprovalService({ ledger, delivery: createFakeDelivery(), clock });
    const c = await ledger.append({ ...agreement });
    const d = await svc.requestMoreInfo(c.id, { approver: 'a', basis: '要確認' });
    expect(d.state).toBe('unverified');
    expect(d.supersedes).toBe(c.id);
  });
  it('reject は base state を維持し差戻し理由を残す', async () => {
    const ledger = createInMemoryLedger(counter());
    const svc = createApprovalService({ ledger, delivery: createFakeDelivery(), clock });
    const c = await ledger.append({ ...agreement });
    const r = await svc.reject(c.id, { approver: 'a', basis: '情報不足' });
    expect(r.state).toBe('ai_inferred');
    expect(r.approval?.basis).toContain('差戻し');
    expect(r.supersedes).toBe(c.id);
  });
  it('supersede済み(旧版)への再承認を構造的に拒否する (非交渉ルール7: 最新版以外を承認しない)', async () => {
    const ledger = createInMemoryLedger(counter());
    const svc = createApprovalService({ ledger, delivery: createFakeDelivery(), clock });
    const c = await ledger.append({ ...agreement });
    await svc.approve(c.id, { approver: 'alice', basis: 'x' }); // c は approved_decision へ繰り上がる
    // 旧版 c への二重承認は拒否される。
    await expect(svc.approve(c.id, { approver: 'bob', basis: 'y' })).rejects.toThrow(/最新版/);
  });

  it('approveWithConditions は conditions を記録する', async () => {
    const ledger = createInMemoryLedger(counter());
    const svc = createApprovalService({ ledger, delivery: createFakeDelivery(), clock });
    const c = await ledger.append({ ...agreement });
    const d = await svc.approveWithConditions(c.id, { approver: 'a', basis: 'ok', conditions: '要フォロー' });
    expect(d.state).toBe('approved_decision');
    expect(d.approval?.conditions).toBe('要フォロー');
  });
});
