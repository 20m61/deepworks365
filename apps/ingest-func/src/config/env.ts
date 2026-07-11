export interface AppConfig {
  appInsightsConnectionString?: string;
  serviceBusNamespace?: string;
  serviceBusQueueName: string;
  version: string;
  commit: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    appInsightsConnectionString: env.APPLICATIONINSIGHTS_CONNECTION_STRING,
    serviceBusNamespace: env.SERVICE_BUS_NAMESPACE,
    serviceBusQueueName: env.SERVICE_BUS_QUEUE ?? 'events',
    version: env.APP_VERSION ?? '0.0.0',
    commit: env.APP_COMMIT ?? 'unknown',
  };
}
