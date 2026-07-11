import { describe, expect, it } from 'vitest';
import { extractApprover, parseApproveBody } from '../src/functions/decisions.js';

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
