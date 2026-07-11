import { describe, expect, it } from 'vitest';
import { parseApproveRequest } from '../src/functions/decisions.js';

describe('parseApproveRequest', () => {
  it('id と approver/basis を検証して取り出す', () => {
    const r = parseApproveRequest('e1', { approver: 'a@x', basis: 'b' });
    expect(r).toEqual({ ok: true, value: { id: 'e1', approver: 'a@x', basis: 'b' } });
  });
  it('approver 欠落は拒否 (人間承認必須)', () => {
    expect(parseApproveRequest('e1', { basis: 'b' }).ok).toBe(false);
  });
  it('body が object でなければ拒否', () => {
    expect(parseApproveRequest('e1', null).ok).toBe(false);
  });
  it('basis 欠落は拒否 (根拠必須)', () => {
    expect(parseApproveRequest('e1', { approver: 'a@x' }).ok).toBe(false);
  });
});
