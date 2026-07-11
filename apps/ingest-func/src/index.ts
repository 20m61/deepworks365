import { app } from '@azure/functions';
import { loadConfig } from './config/env.js';
import { decisionsApproveHandler } from './functions/decisions.js';
import { healthHandler } from './functions/health.js';
import { onEventHandler } from './functions/onEvent.js';
import { startTelemetry } from './observability/telemetry.js';

const cfg = loadConfig();
startTelemetry(cfg);

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: healthHandler,
});

app.serviceBusQueue('onEvent', {
  queueName: cfg.serviceBusQueueName,
  connection: 'ServiceBusConnection',
  handler: onEventHandler,
});

app.http('decisions-approve', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'decisions/{id}/approve',
  handler: decisionsApproveHandler,
});
