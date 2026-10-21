export type HealthProbe = 'liveness' | 'readiness';

export interface HealthCheckRegistration {
  name: string;
  probes: HealthProbe[];
  timeoutMs?: number;
  check(): Promise<void>;
}

export type HealthStatus = 'ok' | 'error';

export interface HealthIndicatorState {
  status: 'up' | 'down';
  message?: string;
  durationMs: number;
}

export interface HealthReport {
  status: HealthStatus;
  info: Record<string, HealthIndicatorState>;
  error: Record<string, HealthIndicatorState>;
  details: Record<string, HealthIndicatorState>;
}
