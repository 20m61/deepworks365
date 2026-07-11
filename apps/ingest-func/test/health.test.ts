import { describe, expect, it } from 'vitest';
import { buildHealth } from '../src/functions/health.js';

describe('buildHealth', () => {
  it('status ok と version/commit を返す', () => {
    const body = buildHealth({
      serviceBusQueueName: 'events',
      version: '1.0.0',
      commit: 'deadbee',
    });
    expect(body).toEqual({ status: 'ok', version: '1.0.0', commit: 'deadbee' });
  });
});
