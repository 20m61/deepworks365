import { describe, expect, it } from 'vitest';
import { fact, hypothesis, decision, isDecision } from '../src/result.js';

describe('result/knowledge', () => {
  it('種別を保持する', () => {
    expect(fact(42).kind).toBe('fact');
    expect(hypothesis('x').kind).toBe('hypothesis');
  });
  it('basis(根拠)を保持できる', () => {
    expect(fact(1, 'doc#3').basis).toBe('doc#3');
  });
  it('isDecision は decision のみ true', () => {
    expect(isDecision(decision('go'))).toBe(true);
    expect(isDecision(hypothesis('maybe'))).toBe(false);
  });
});
