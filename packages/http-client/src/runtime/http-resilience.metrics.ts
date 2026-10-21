import { Gauge } from '@prometheus-io/client';
import { metricsRegistry } from '#kernel/monitoring/metrics.registry';
import type { HttpResilience } from '#kernel/http-client/http-resilience';

const STATE_VALUE = { closed: 0, 'half-open': 1, open: 2 } as const;

let bound: HttpResilience | null = null;

function register(
  name: string,
  help: string,
  labelNames: string[],
  fill: (gauge: Gauge<string>, resilience: HttpResilience) => void,
): void {
  if (metricsRegistry.getSingleMetric(name)) {
    return;
  }

  const gauge: Gauge<string> = new Gauge<string>({
    name,
    help,
    labelNames,
    registers: [metricsRegistry],
    collect() {
      gauge.reset();

      if (bound) {
        fill(gauge, bound);
      }
    },
  });
}

/**
 * Read at scrape time from the live gates, so the numbers cannot drift from
 * what the breaker actually holds. The metrics registry is process-wide, so
 * the series are declared once and follow whichever resilience was bound last.
 */
export function bindCircuitMetrics(resilience: HttpResilience): void {
  bound = resilience;

  register(
    'http_client_circuit_state',
    'Circuit state per host: 0 closed, 1 half-open, 2 open',
    ['host'],
    (gauge, current) => {
      for (const snapshot of current.snapshots()) {
        gauge.set({ host: snapshot.host }, STATE_VALUE[snapshot.state]);
      }
    },
  );

  register(
    'http_client_in_flight',
    'Calls to a host currently in flight',
    ['host'],
    (gauge, current) => {
      for (const snapshot of current.snapshots()) {
        gauge.set({ host: snapshot.host }, snapshot.inFlight);
      }
    },
  );

  register(
    'http_client_rejected_calls',
    'Calls refused without reaching the host, by reason',
    ['host', 'reason'],
    (gauge, current) => {
      for (const snapshot of current.snapshots()) {
        gauge.set(
          { host: snapshot.host, reason: 'circuit_open' },
          snapshot.rejectedByCircuit,
        );
        gauge.set(
          { host: snapshot.host, reason: 'bulkhead_full' },
          snapshot.rejectedByBulkhead,
        );
      }
    },
  );
}
