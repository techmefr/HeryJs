import { DuplicateHealthCheckException } from './duplicate-health-check.exception';
import { HealthRegistry } from './health-registry';

const up = async (): Promise<void> => undefined;

describe('HealthRegistry', () => {
  it('reports ok when every check of the probe passes', async () => {
    const registry = new HealthRegistry();
    registry.register({ name: 'database', probes: ['readiness'], check: up });
    registry.register({ name: 'cache', probes: ['readiness'], check: up });

    const report = await registry.report('readiness');

    expect(report.status).toBe('ok');
    expect(Object.keys(report.info)).toEqual(['database', 'cache']);
    expect(report.error).toEqual({});
  });

  it('reports error and quotes the failure of the check that threw', async () => {
    const registry = new HealthRegistry();
    registry.register({ name: 'database', probes: ['readiness'], check: up });
    registry.register({
      name: 'cache',
      probes: ['readiness'],
      check: () => Promise.reject(new Error('connection refused')),
    });

    const report = await registry.report('readiness');

    expect(report.status).toBe('error');
    expect(report.error.cache?.message).toBe('connection refused');
    expect(report.info.database?.status).toBe('up');
  });

  it('keeps liveness and readiness apart, so a dependency never fails liveness', async () => {
    const registry = new HealthRegistry();
    registry.register({ name: 'process', probes: ['liveness'], check: up });
    registry.register({
      name: 'database',
      probes: ['readiness'],
      check: () => Promise.reject(new Error('down')),
    });

    expect((await registry.report('liveness')).status).toBe('ok');
    expect((await registry.report('readiness')).status).toBe('error');
    expect(registry.names('liveness')).toEqual(['process']);
  });

  it('lets one check serve both probes', async () => {
    const registry = new HealthRegistry();
    registry.register({
      name: 'both',
      probes: ['liveness', 'readiness'],
      check: up,
    });

    expect(registry.names('liveness')).toEqual(['both']);
    expect(registry.names('readiness')).toEqual(['both']);
  });

  it('turns a check that never answers into a failure at its own timeout', async () => {
    const registry = new HealthRegistry();
    registry.register({
      name: 'storage',
      probes: ['readiness'],
      timeoutMs: 20,
      check: () => new Promise<void>(() => undefined),
    });

    const report = await registry.report('readiness');

    expect(report.status).toBe('error');
    expect(report.error.storage?.message).toContain('within 20ms');
  });

  it('is ok when the probe has no check at all', async () => {
    const registry = new HealthRegistry();

    expect((await registry.report('liveness')).status).toBe('ok');
  });

  it('refuses two checks under one name', () => {
    const registry = new HealthRegistry();
    registry.register({ name: 'mail', probes: ['readiness'], check: up });

    expect(() =>
      registry.register({ name: 'mail', probes: ['readiness'], check: up }),
    ).toThrow(DuplicateHealthCheckException);
  });
});
