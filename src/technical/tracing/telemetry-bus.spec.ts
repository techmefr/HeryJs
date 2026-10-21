import { TelemetryBus } from './telemetry-bus';
import type { TelemetryRecord } from './telemetry-bus';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';

const QUERY = { kind: 'query', sql: 'SELECT 1', durationMs: 1 } as const;

describe('TelemetryBus', () => {
  const heard: TelemetryRecord[] = [];
  let unsubscribe: () => void;

  beforeEach(() => {
    heard.length = 0;
    unsubscribe = TelemetryBus.subscribe((record) => heard.push(record));
  });

  afterEach(() => {
    unsubscribe();
  });

  it('stamps the ambient tenant and request', () => {
    TenantContextStorage.run({ tenantId: 'acme' }, () => {
      TelemetryBus.runInRequest('req-1', () => TelemetryBus.emit(QUERY));
    });

    expect(heard).toHaveLength(1);
    expect(heard[0]).toMatchObject({ tenantId: 'acme', requestId: 'req-1' });
  });

  it('lets the caller name the tenant explicitly, null included', () => {
    TelemetryBus.emit(QUERY, { tenantId: null });

    expect(heard[0]?.tenantId).toBeNull();
  });

  it('is silent for whatever runs muted', () => {
    TelemetryBus.runMuted(() => TelemetryBus.emit(QUERY));

    expect(heard).toHaveLength(0);
  });

  it('keeps going when one listener throws', () => {
    const throwing = TelemetryBus.subscribe(() => {
      throw new Error('boom');
    });

    expect(() => TelemetryBus.emit(QUERY)).not.toThrow();
    expect(heard).toHaveLength(1);

    throwing();
  });

  it('stops delivering after unsubscribe', () => {
    unsubscribe();
    TelemetryBus.emit(QUERY);

    expect(heard).toHaveLength(0);
    expect(TelemetryBus.hasListeners()).toBe(false);
  });
});
