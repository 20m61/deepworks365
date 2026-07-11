// 非交渉ルール6: 推定/仮説/事実/正式決定 をデータ上で分離する。
export type Provenance = 'fact' | 'hypothesis' | 'estimate' | 'decision';

export interface Knowledge<T> {
  kind: Provenance;
  value: T;
  basis?: string; // 根拠ID/出典 (追跡可能性 ルール7)
}

const make =
  (kind: Provenance) =>
  <T>(value: T, basis?: string): Knowledge<T> => ({ kind, value, basis });

export const fact = make('fact');
export const hypothesis = make('hypothesis');
export const estimate = make('estimate');
export const decision = make('decision');

export function isDecision<T>(k: Knowledge<T>): boolean {
  return k.kind === 'decision';
}
