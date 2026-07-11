import { useAzureMonitor } from '@azure/monitor-opentelemetry';
import { loadConfig, type AppConfig } from '../config/env.js';

let started = false;

export function shouldStart(cfg: AppConfig): boolean {
  return typeof cfg.appInsightsConnectionString === 'string'
    && cfg.appInsightsConnectionString.length > 0;
}

// App Insights 接続文字列がある時のみ OTel を初期化（冪等）。
export function startTelemetry(cfg: AppConfig = loadConfig()): void {
  if (started || !shouldStart(cfg)) return;
  useAzureMonitor({
    azureMonitorExporterOptions: { connectionString: cfg.appInsightsConnectionString },
  });
  started = true;
}
