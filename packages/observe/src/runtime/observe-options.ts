import type {
  CreateObserveModuleOptions,
  ObserveOptions,
} from '@nestjs/observe';
import { observeEnv } from './observe.env';

export interface HeryObserveSettings {
  create: CreateObserveModuleOptions;
  module: ObserveOptions;
}

export function observeSettings(): HeryObserveSettings {
  const env = observeEnv();

  return {
    create: { sourceContext: env.OBSERVE_SOURCE_CONTEXT },
    module: {
      enabled: env.OBSERVE_ENABLED,
      serviceId: env.OBSERVE_SERVICE_ID,
      forwardLogs: env.OBSERVE_FORWARD_LOGS,
      ...(env.OBSERVE_ENDPOINT ? { endpoint: env.OBSERVE_ENDPOINT } : {}),
    },
  };
}
