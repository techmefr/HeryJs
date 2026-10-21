import { logs } from '@opentelemetry/api-logs';
import type { LogRecord, LoggerProvider } from '@opentelemetry/api-logs';
import {
  attributesOf,
  emitLog,
  splitLogArguments,
  telemetryPinoOptions,
} from './telemetry-logs';

const emitted: LogRecord[] = [];

const provider: LoggerProvider = {
  getLogger: () => ({
    enabled: () => true,
    emit: (record: LogRecord) => {
      emitted.push(record);
    },
  }),
};

describe('telemetry logs', () => {
  beforeAll(() => {
    logs.setGlobalLoggerProvider(provider);
  });

  beforeEach(() => {
    emitted.length = 0;
  });

  it('reads a pino call in each of its shapes', () => {
    expect(splitLogArguments(['plain'])).toEqual({
      fields: {},
      message: 'plain',
    });
    expect(splitLogArguments([{ tenant: 'a' }, 'with fields'])).toEqual({
      fields: { tenant: 'a' },
      message: 'with fields',
    });
    expect(splitLogArguments([new Error('boom')]).message).toBe('boom');
  });

  it('maps the pino level to an OTel severity', () => {
    emitLog(50, ['it broke']);
    emitLog(30, ['it happened']);

    expect(emitted.map((record) => record.severityText)).toEqual([
      'ERROR',
      'INFO',
    ]);
  });

  it('never exports an object field, so a request with its Authorization header cannot leave', () => {
    const attributes = attributesOf({
      tenant: 'acme',
      attempt: 2,
      req: { headers: { authorization: 'Bearer secret-token' } },
    });

    expect(attributes).toEqual({ tenant: 'acme', attempt: 2 });
    expect(JSON.stringify(attributes)).not.toContain('secret-token');
  });

  it('carries an error as exception attributes', () => {
    const attributes = attributesOf({ err: new TypeError('bad input') });

    expect(attributes['exception.type']).toBe('TypeError');
    expect(attributes['exception.message']).toBe('bad input');
  });

  it('adds no hook while the logs signal is off, so nothing is copied for nothing', () => {
    expect(telemetryPinoOptions({}).hooks).toBeUndefined();
  });

  it('mirrors a log into OTel and still writes it to pino once the signal is on', () => {
    const options = telemetryPinoOptions({
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318',
    });
    const written: unknown[][] = [];

    options.hooks!.logMethod.call(
      {},
      [{ tenant: 'acme' }, 'order placed'],
      (...args: unknown[]) => written.push(args),
      30,
    );

    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.body).toBe('order placed');
    expect(written).toEqual([[{ tenant: 'acme' }, 'order placed']]);
  });
});
