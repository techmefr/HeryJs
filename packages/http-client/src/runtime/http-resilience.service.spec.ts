import { HeryConfig } from '#kernel/config/hery-config.types';
import { HealthRegistry } from '#kernel/health/health-registry';
import { metricsRegistry } from '#kernel/monitoring/metrics.registry';
import { operatorAbility } from '#kernel/capabilities/ability';
import { env } from '#kernel/config/env';
import { FakeHttpClientDriver } from './fake-http-client.driver';
import { HttpClientDriverRegistry } from './http-client-driver.registry';
import { HttpClientService } from './http-client.service';
import { HttpResilienceController } from './http-resilience.controller';
import { HttpResilienceService } from './http-resilience.service';
import {
  canManageHttpCircuits,
  canReadHttpCircuits,
} from './http-resilience.policy';

const URL = 'https://payments.example.com/charge';
const HOST = 'payments.example.com';

function setup(resilience: unknown = { failureThreshold: 2 }) {
  const fake = new FakeHttpClientDriver();
  const health = new HealthRegistry();
  const config = { httpClient: { resilience } } as HeryConfig;
  const service = new HttpResilienceService(config, health);
  service.onModuleInit();

  const registry = { active: fake } as unknown as HttpClientDriverRegistry;
  const http = new HttpClientService(registry, service);

  return { fake, health, service, http };
}

describe('HTTP client resilience', () => {
  it('holds the fake driver to the same circuit as the real one', async () => {
    const { fake, http } = setup();
    fake.stub('https://payments.example.com/*', { status: 503 });

    await http.get(URL);
    await http.get(URL);

    await expect(http.get(URL)).rejects.toMatchObject({
      key: 'http.circuit-open',
    });
    expect(fake.recorded).toHaveLength(2);
  });

  it('reports an open circuit in the readiness probe', async () => {
    const { fake, health, http } = setup();
    fake.stub('https://payments.example.com/*', { status: 500 });

    expect((await health.report('readiness')).status).toBe('ok');

    await http.get(URL);
    await http.get(URL);

    const report = await health.report('readiness');

    expect(report.status).toBe('error');
    expect(report.error['http-circuits']?.message).toContain(HOST);
  });

  it('stays out of the readiness probe when the project turns that off', () => {
    const { health } = setup({ healthCheck: false });

    expect(health.names('readiness')).not.toContain('http-circuits');
  });

  it('exposes the circuit as metrics', async () => {
    const { fake, http } = setup();
    fake.stub('https://payments.example.com/*', { status: 502 });

    await http.get(URL);
    await http.get(URL);
    await http.get(URL).catch(() => undefined);

    const scrape = await metricsRegistry.metrics();

    expect(scrape).toContain(`http_client_circuit_state{host="${HOST}"} 2`);
    expect(scrape).toContain(
      `http_client_rejected_calls{host="${HOST}",reason="circuit_open"} 1`,
    );
  });

  describe('operator routes', () => {
    it('lists, trips, clears and re-tunes a circuit', async () => {
      const { fake, http, service } = setup();
      const controller = new HttpResilienceController(service);
      fake.stub('https://payments.example.com/*', { status: 200 });
      await http.get(URL);

      expect(controller.circuits().data).toMatchObject([
        { host: HOST, state: 'closed' },
      ]);
      expect(controller.open(HOST).data.state).toBe('open');
      await expect(http.get(URL)).rejects.toMatchObject({
        key: 'http.circuit-open',
      });
      expect(controller.reset(HOST).data.state).toBe('closed');
      expect(
        controller.configure(HOST, { maxConcurrent: 3 }).data.settings,
      ).toMatchObject({ maxConcurrent: 3 });
    });

    it('answers 404 for a host that was never called', () => {
      const { service } = setup();
      const controller = new HttpResilienceController(service);

      expect(() => controller.reset('nobody.example.com')).toThrow(
        'Circuit not found',
      );
    });

    it('is reserved to the platform operator, never a tenant admin', () => {
      type Subject = Parameters<typeof operatorAbility>[0];
      const mutableEnv = env as unknown as Record<string, string | undefined>;
      const saved = mutableEnv.PLATFORM_OPERATOR_IDS;
      const member = { id: 'member', role: 'member' } as Subject;
      const admin = { id: 'admin', role: 'admin' } as Subject;
      const operator = { id: 'operator', role: null } as Subject;
      mutableEnv.PLATFORM_OPERATOR_IDS = 'operator';

      expect(canReadHttpCircuits(member).allowed).toBe(false);
      expect(canManageHttpCircuits(member).allowed).toBe(false);
      expect(canManageHttpCircuits(admin).allowed).toBe(false);
      expect(canReadHttpCircuits(admin).allowed).toBe(false);
      expect(canManageHttpCircuits(operator).allowed).toBe(true);

      mutableEnv.PLATFORM_OPERATOR_IDS = saved;
    });
  });
});
