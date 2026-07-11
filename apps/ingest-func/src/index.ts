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

// authLevel は多層防御。実際の承認者束縛は Easy Auth (x-ms-client-principal-id) で行う。
// 非交渉ルール2,4: 匿名承認を許さない。
app.http('decisions-approve', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'decisions/{id}/approve',
  handler: decisionsApproveHandler,
});
