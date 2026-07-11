import { describe, expect, it } from 'vitest';
import { requiresHumanApproval, isHumanOnly, rank } from '../src/boundaries.js';

describe('boundaries', () => {
  it('L0/L1 は人間承認不要', () => {
    expect(requiresHumanApproval('L0')).toBe(false);
    expect(requiresHumanApproval('L1')).toBe(false);
  });
  it('L2 以上は人間承認が要る', () => {
    expect(requiresHumanApproval('L2')).toBe(true);
    expect(requiresHumanApproval('L5')).toBe(true);
  });
  it('L5 のみ人間専用', () => {
    expect(isHumanOnly('L5')).toBe(true);
    expect(isHumanOnly('L4')).toBe(false);
  });
  it('rank は順序を持つ', () => {
    expect(rank('L0')).toBeLessThan(rank('L5'));
  });
});
