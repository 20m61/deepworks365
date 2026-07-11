import { describe, expect, it } from 'vitest';
import { parseEvent } from '../src/functions/onEvent.js';

describe('parseEvent', () => {
  it('正常なイベントを解析する', () => {
    const r = parseEvent({ id: 'e1', type: 'meeting.ended', occurredAt: '2026-07-11T00:00:00Z' });
    expect(r).toEqual({
      ok: true,
      value: { id: 'e1', type: 'meeting.ended', occurredAt: '2026-07-11T00:00:00Z' },
    });
  });
  it('occurredAt 欠落は空文字で許容', () => {
    const r = parseEvent({ id: 'e1', type: 't' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.occurredAt).toBe('');
  });
  it('id 欠落は拒否（未信頼入力を通さない）', () => {
    expect(parseEvent({ type: 't' })).toEqual({ ok: false, error: 'id required' });
  });
  it('オブジェクト以外は拒否', () => {
    expect(parseEvent('nope').ok).toBe(false);
    expect(parseEvent(null).ok).toBe(false);
  });
});
