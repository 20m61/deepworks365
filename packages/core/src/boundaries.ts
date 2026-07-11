// docs/06 の実行レベル。L2(社内保存)以上は人間の確認/承認が要る。L5 は人間専用。
export const EXECUTION_LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'] as const;
export type ExecutionLevel = (typeof EXECUTION_LEVELS)[number];

export function rank(level: ExecutionLevel): number {
  return EXECUTION_LEVELS.indexOf(level);
}

export function requiresHumanApproval(level: ExecutionLevel): boolean {
  return rank(level) >= rank('L2');
}

export function isHumanOnly(level: ExecutionLevel): boolean {
  return level === 'L5';
}
