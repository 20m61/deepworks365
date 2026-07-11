import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { loadConfig, type AppConfig } from '../config/env.js';

export interface HealthBody {
  status: 'ok';
  version: string;
  commit: string;
}

// Fast Path: AI を呼ばない決定論処理。
export function buildHealth(cfg: AppConfig = loadConfig()): HealthBody {
  return { status: 'ok', version: cfg.version, commit: cfg.commit };
}

export async function healthHandler(
  _req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  return { status: 200, jsonBody: buildHealth() };
}
