import {
  HttpBulkheadFullException,
  HttpCircuitOpenException,
  HttpRequestFailedException,
  HttpRequestTimeoutException,
} from './http-client.exception';
import type { HttpResponse } from './http-client-driver';

export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Four numbers, per host. `failureThreshold` consecutive dependency failures
 * open the circuit; after `openMs` it lets `halfOpenProbes` calls through to
 * see whether the dependency is back; `maxConcurrent` is the bulkhead, the
 * most calls to one host in flight at once.
 */
export interface HttpResilienceSettings {
  failureThreshold: number;
  openMs: number;
  halfOpenProbes: number;
  maxConcurrent: number;
}

export const DEFAULT_HTTP_RESILIENCE: HttpResilienceSettings = {
  failureThreshold: 5,
  openMs: 30_000,
  halfOpenProbes: 1,
  maxConcurrent: 20,
};

export interface HttpResilienceConfig extends Partial<HttpResilienceSettings> {
  /** Off switch for the whole feature; on by default. */
  enabled?: boolean;
  /**
   * Whether an open circuit makes the readiness probe fail. On by default so
   * the state is visible in /health; turn it off when taking a pod out of
   * rotation because one third party is down would be worse than serving.
   */
  healthCheck?: boolean;
  hosts?: Record<string, Partial<HttpResilienceSettings>>;
}

export interface CircuitSnapshot {
  host: string;
  state: CircuitState;
  consecutiveFailures: number;
  inFlight: number;
  openedAt: string | null;
  retryAfterMs: number;
  rejectedByCircuit: number;
  rejectedByBulkhead: number;
  settings: HttpResilienceSettings;
}

export type Clock = () => number;

/**
 * A failure of the dependency, as opposed to a failure of the request. A
 * timeout, a transport error, a 5xx and a 429 say the other side is struggling;
 * any other 4xx is this side's mistake and the dependency answered perfectly
 * well, so it must not push a healthy host towards open.
 */
export function isDependencyFailure(error: unknown): boolean {
  if (error instanceof HttpRequestTimeoutException) {
    return true;
  }

  return (
    error instanceof HttpRequestFailedException &&
    isFailingStatus(error.responseStatus)
  );
}

export function isFailingStatus(status: number): boolean {
  return status === 0 || status === 429 || status >= 500;
}

/**
 * The breaker and the bulkhead of one host. State lives in this process only:
 * each instance learns about a failing dependency from its own calls, which is
 * what keeps the check free of any shared store on the request path.
 */
export class HostGate {
  private state: CircuitState = 'closed';
  private consecutiveFailures = 0;
  private openedAt: number | null = null;
  private inFlight = 0;
  private probes = 0;
  private rejectedByCircuit = 0;
  private rejectedByBulkhead = 0;

  constructor(
    readonly host: string,
    private settings: HttpResilienceSettings,
    private readonly clock: Clock,
  ) {}

  async run(call: () => Promise<HttpResponse>): Promise<HttpResponse> {
    this.admit();

    this.inFlight += 1;

    try {
      const response = await call();

      if (isFailingStatus(response.status)) {
        this.recordFailure();
      } else {
        this.recordSuccess();
      }

      return response;
    } catch (error) {
      if (isDependencyFailure(error)) {
        this.recordFailure();
      } else if (error instanceof HttpRequestFailedException) {
        this.recordSuccess();
      }

      throw error;
    } finally {
      this.inFlight -= 1;
    }
  }

  configure(settings: Partial<HttpResilienceSettings>): void {
    this.settings = { ...this.settings, ...settings };
  }

  /** An operator tripping the circuit by hand, to shed a dependency on purpose. */
  open(): void {
    this.trip();
  }

  /** An operator closing the circuit once the dependency is known to be back. */
  reset(): void {
    this.state = 'closed';
    this.consecutiveFailures = 0;
    this.openedAt = null;
    this.probes = 0;
  }

  snapshot(): CircuitSnapshot {
    this.refresh();

    return {
      host: this.host,
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      inFlight: this.inFlight,
      openedAt:
        this.openedAt === null ? null : new Date(this.openedAt).toISOString(),
      retryAfterMs: this.retryAfterMs(),
      rejectedByCircuit: this.rejectedByCircuit,
      rejectedByBulkhead: this.rejectedByBulkhead,
      settings: { ...this.settings },
    };
  }

  private admit(): void {
    this.refresh();

    if (this.state === 'open') {
      this.rejectedByCircuit += 1;
      throw new HttpCircuitOpenException(this.host, this.retryAfterMs());
    }

    if (this.state === 'half-open') {
      if (this.probes >= this.settings.halfOpenProbes) {
        this.rejectedByCircuit += 1;
        throw new HttpCircuitOpenException(this.host, this.retryAfterMs());
      }

      this.probes += 1;
    }

    if (this.inFlight >= this.settings.maxConcurrent) {
      this.rejectedByBulkhead += 1;

      if (this.state === 'half-open') {
        this.probes -= 1;
      }

      throw new HttpBulkheadFullException(
        this.host,
        this.settings.maxConcurrent,
      );
    }
  }

  private refresh(): void {
    if (
      this.state === 'open' &&
      this.openedAt !== null &&
      this.clock() - this.openedAt >= this.settings.openMs
    ) {
      this.state = 'half-open';
      this.probes = 0;
    }
  }

  private retryAfterMs(): number {
    if (this.state !== 'open' || this.openedAt === null) {
      return 0;
    }

    return Math.max(0, this.settings.openMs - (this.clock() - this.openedAt));
  }

  private recordSuccess(): void {
    this.consecutiveFailures = 0;

    if (this.state === 'half-open') {
      this.state = 'closed';
      this.openedAt = null;
      this.probes = 0;
    }
  }

  private recordFailure(): void {
    this.consecutiveFailures += 1;

    if (
      this.state === 'half-open' ||
      this.consecutiveFailures >= this.settings.failureThreshold
    ) {
      this.trip();
    }
  }

  private trip(): void {
    this.state = 'open';
    this.openedAt = this.clock();
    this.probes = 0;
  }
}

/** The host a URL is called on, which is the unit a circuit protects. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'unknown';
  }
}

/**
 * One gate per host, created on the first call. A project's settings, then a
 * host's own, then whatever an operator changed at runtime, apply in that
 * order.
 */
export class HttpResilience {
  private readonly gates = new Map<string, HostGate>();
  private readonly overrides = new Map<
    string,
    Partial<HttpResilienceSettings>
  >();

  constructor(
    private readonly config: HttpResilienceConfig = {},
    private readonly clock: Clock = Date.now,
  ) {}

  get isEnabled(): boolean {
    return this.config.enabled !== false;
  }

  get reportsInHealth(): boolean {
    return this.config.healthCheck !== false;
  }

  run(url: string, call: () => Promise<HttpResponse>): Promise<HttpResponse> {
    if (!this.isEnabled) {
      return call();
    }

    return this.gateFor(hostOf(url)).run(call);
  }

  gateFor(host: string): HostGate {
    let gate = this.gates.get(host);

    if (!gate) {
      gate = new HostGate(host, this.settingsFor(host), this.clock);
      this.gates.set(host, gate);
    }

    return gate;
  }

  find(host: string): HostGate | undefined {
    return this.gates.get(host);
  }

  configure(host: string, settings: Partial<HttpResilienceSettings>): void {
    this.overrides.set(host, { ...this.overrides.get(host), ...settings });
    this.gateFor(host).configure(settings);
  }

  snapshots(): CircuitSnapshot[] {
    return [...this.gates.values()].map((gate) => gate.snapshot());
  }

  private settingsFor(host: string): HttpResilienceSettings {
    const { enabled, healthCheck, hosts, ...shared } = this.config;

    void enabled;
    void healthCheck;

    return {
      ...DEFAULT_HTTP_RESILIENCE,
      ...shared,
      ...hosts?.[host],
      ...this.overrides.get(host),
    };
  }
}
