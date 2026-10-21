import { env as appEnv } from '#technical/config/env';

export interface TelemetryEnv {
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?: string;
  OTEL_EXPORTER_OTLP_METRICS_ENDPOINT?: string;
  OTEL_EXPORTER_OTLP_LOGS_ENDPOINT?: string;
  OTEL_TRACES_EXPORTER?: string;
  OTEL_METRICS_EXPORTER?: string;
  OTEL_LOGS_EXPORTER?: string;
  OTEL_SDK_DISABLED?: string;
  OTEL_SERVICE_NAME?: string;
}

export interface TelemetrySignals {
  traces: boolean;
  metrics: boolean;
  logs: boolean;
}

const DEFAULT_SERVICE_NAME = 'heryjs';

function hasValue(value: string | undefined): boolean {
  return value !== undefined && value.trim() !== '';
}

function isSignalEnabled(
  env: TelemetryEnv,
  signal: 'TRACES' | 'METRICS' | 'LOGS',
): boolean {
  const hasEndpoint =
    hasValue(env.OTEL_EXPORTER_OTLP_ENDPOINT) ||
    hasValue(env[`OTEL_EXPORTER_OTLP_${signal}_ENDPOINT`]);

  return hasEndpoint && env[`OTEL_${signal}_EXPORTER`]?.trim() !== 'none';
}

export function telemetrySignals(env: TelemetryEnv = appEnv): TelemetrySignals {
  if (env.OTEL_SDK_DISABLED?.trim().toLowerCase() === 'true') {
    return { traces: false, metrics: false, logs: false };
  }

  return {
    traces: isSignalEnabled(env, 'TRACES'),
    metrics: isSignalEnabled(env, 'METRICS'),
    logs: isSignalEnabled(env, 'LOGS'),
  };
}

export function isTelemetryEnabled(env: TelemetryEnv = appEnv): boolean {
  const signals = telemetrySignals(env);

  return signals.traces || signals.metrics || signals.logs;
}

export function telemetryServiceName(env: TelemetryEnv = appEnv): string {
  return hasValue(env.OTEL_SERVICE_NAME)
    ? env.OTEL_SERVICE_NAME!
    : DEFAULT_SERVICE_NAME;
}
