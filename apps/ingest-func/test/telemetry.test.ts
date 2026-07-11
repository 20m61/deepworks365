import { describe, expect, it } from 'vitest';
import { shouldStart } from '../src/observability/telemetry.js';

describe('shouldStart', () => {
  it('接続文字列が無ければ起動しない', () => {
    expect(shouldStart({ serviceBusQueueName: 'events', version: '0', commit: 'x' })).toBe(false);
  });
  it('接続文字列があれば起動する', () => {
    expect(
      shouldStart({
        serviceBusQueueName: 'events',
        version: '0',
        commit: 'x',
        appInsightsConnectionString: 'InstrumentationKey=abc',
      }),
    ).toBe(true);
  });
});
