import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env.js';

describe('loadConfig', () => {
  it('既定値を返す', () => {
    const c = loadConfig({});
    expect(c.serviceBusQueueName).toBe('events');
    expect(c.version).toBe('0.0.0');
    expect(c.commit).toBe('unknown');
  });
  it('環境変数を反映する', () => {
    const c = loadConfig({ APP_VERSION: '1.2.3', APP_COMMIT: 'abc', SERVICE_BUS_QUEUE: 'q1' });
    expect(c.version).toBe('1.2.3');
    expect(c.commit).toBe('abc');
    expect(c.serviceBusQueueName).toBe('q1');
  });
});
