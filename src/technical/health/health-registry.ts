import { Injectable } from '@nestjs/common';
import { HealthCheckTimeoutError } from './health-check-timeout.error';
import { DuplicateHealthCheckException } from './duplicate-health-check.exception';
import type {
  HealthCheckRegistration,
  HealthIndicatorState,
  HealthProbe,
  HealthReport,
} from './health-check';

const DEFAULT_TIMEOUT_MS = 3000;

function withTimeout(registration: HealthCheckRegistration): Promise<void> {
  const timeoutMs = registration.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timer: NodeJS.Timeout | undefined;

  const expiry = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new HealthCheckTimeoutError(registration.name, timeoutMs)),
      timeoutMs,
    );
  });

  return Promise.race([registration.check(), expiry]).finally(() =>
    clearTimeout(timer),
  );
}

async function runOne(
  registration: HealthCheckRegistration,
): Promise<HealthIndicatorState> {
  const startedAt = performance.now();

  try {
    await withTimeout(registration);
    return { status: 'up', durationMs: performance.now() - startedAt };
  } catch (error) {
    return {
      status: 'down',
      message: error instanceof Error ? error.message : String(error),
      durationMs: performance.now() - startedAt,
    };
  }
}

/**
 * Liveness and readiness are different questions, and answering both with one
 * list is how an orchestrator ends up restarting a healthy process because the
 * database blinked. A liveness probe means "this process is wedged, kill it"
 * and must never depend on anything outside the process; a readiness probe
 * means "send me traffic", and is exactly where the dependencies belong.
 *
 * Checks run in parallel, each under its own timeout, so one dependency that
 * hangs costs the probe its timeout once rather than the sum of every hang.
 */
@Injectable()
export class HealthRegistry {
  private readonly registrations = new Map<string, HealthCheckRegistration>();

  register(registration: HealthCheckRegistration): void {
    if (this.registrations.has(registration.name)) {
      throw new DuplicateHealthCheckException(registration.name);
    }

    this.registrations.set(registration.name, registration);
  }

  names(probe: HealthProbe): string[] {
    return this.forProbe(probe).map((registration) => registration.name);
  }

  async report(probe: HealthProbe): Promise<HealthReport> {
    const registrations = this.forProbe(probe);
    const states = await Promise.all(registrations.map(runOne));

    const details: Record<string, HealthIndicatorState> = {};
    const info: Record<string, HealthIndicatorState> = {};
    const error: Record<string, HealthIndicatorState> = {};

    registrations.forEach((registration, index) => {
      const state = states[index]!;
      details[registration.name] = state;
      (state.status === 'up' ? info : error)[registration.name] = state;
    });

    return {
      status: Object.keys(error).length === 0 ? 'ok' : 'error',
      info,
      error,
      details,
    };
  }

  private forProbe(probe: HealthProbe): HealthCheckRegistration[] {
    return [...this.registrations.values()].filter((registration) =>
      registration.probes.includes(probe),
    );
  }
}
