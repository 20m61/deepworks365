import { describe, expect, it } from 'vitest';
import { approveErrorStatus, extractApprover, parseApproveBody } from '../src/functions/decisions.js';

describe('extractApprover', () => {
  it('Easy Auth の x-ms-client-principal-id を承認者IDへ束縛する', () => {
    const h = new Headers({ 'x-ms-client-principal-id': 'oid-123' });
    expect(extractApprover(h)).toBe('oid-123');
  });
  it('認証ヘッダーが無ければ null (匿名承認を拒否: 非交渉ルール2,4)', () => {
    expect(extractApprover(new Headers())).toBeNull();
  });
  it('空の principal id は null 扱い', () => {
    expect(extractApprover(new Headers({ 'x-ms-client-principal-id': '  ' }))).toBeNull();
  });
});

describe('parseApproveBody', () => {
  it('basis を検証して取り出す (approver は body から取らない)', () => {
    expect(parseApproveBody({ basis: '議事録 u1' })).toEqual({ ok: true, value: { basis: '議事録 u1' } });
  });
  it('body の自己申告 approver は無視する (信頼しない)', () => {
    // approver を詐称しても basis のみ採用され、承認者は認証コンテキストで決まる。
    const r = parseApproveBody({ approver: 'attacker@evil', basis: 'b' });
    expect(r).toEqual({ ok: true, value: { basis: 'b' } });
  });
  it('basis 欠落は拒否 (根拠必須 ルール7)', () => {
    expect(parseApproveBody({}).ok).toBe(false);
  });
  it('body が object でなければ拒否', () => {
    expect(parseApproveBody(null).ok).toBe(false);
  });
});

describe('approveErrorStatus', () => {
  it('"not found" を含むメッセージは 404', () => {
    expect(approveErrorStatus('ledger entry not found: e1')).toBe(404);
  });
  it('head 競合 (concurrent supersede) は 409', () => {
    expect(approveErrorStatus('entry e1 is no longer head (concurrent supersede)')).toBe(409);
  });
  it('繰り上がり済みの日本語競合メッセージは 409', () => {
    expect(approveErrorStatus('entry e1 は既に新版へ繰り上がっている: e2')).toBe(409);
  });
  it('承認対象ではない (issue not approvable) は 409', () => {
    expect(approveErrorStatus('issue は承認対象ではない')).toBe(409);
  });
  it('未知のインフラ障害は 500 (409に丸めない)', () => {
    expect(approveErrorStatus('ECONNRESET')).toBe(500);
  });
});
