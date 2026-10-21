export type TelemetryEnv = Record<string, string | undefined>;

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

export function telemetrySignals(
  env: TelemetryEnv = process.env,
): TelemetrySignals {
  if (env.OTEL_SDK_DISABLED?.trim().toLowerCase() === 'true') {
    return { traces: false, metrics: false, logs: false };
  }

  return {
    traces: isSignalEnabled(env, 'TRACES'),
    metrics: isSignalEnabled(env, 'METRICS'),
    logs: isSignalEnabled(env, 'LOGS'),
  };
}

export function isTelemetryEnabled(env: TelemetryEnv = process.env): boolean {
  const signals = telemetrySignals(env);

  return signals.traces || signals.metrics || signals.logs;
}

export function telemetryServiceName(env: TelemetryEnv = process.env): string {
  return hasValue(env.OTEL_SERVICE_NAME)
    ? env.OTEL_SERVICE_NAME!
    : DEFAULT_SERVICE_NAME;
}
