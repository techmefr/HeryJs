import { metrics } from '@opentelemetry/api';
import type { Histogram } from '@opentelemetry/api';

const METER_NAME = 'heryjs';

let requestDuration: Histogram | null = null;

function histogram(): Histogram {
  requestDuration ??= metrics
    .getMeter(METER_NAME)
    .createHistogram('http.server.request.duration', {
      description: 'Duration of HTTP server requests',
      unit: 's',
    });

  return requestDuration;
}

export function recordRequestDuration(
  method: string,
  route: string,
  status: number,
  durationSeconds: number,
): void {
  histogram().record(durationSeconds, {
    'http.request.method': method,
    'http.route': route,
    'http.response.status_code': status,
  });
}
