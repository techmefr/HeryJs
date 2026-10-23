import type { HealthRegistry } from '#kernel/public/observability';
import { TenantContextStorage } from '#kernel/public/tenancy';
import { FakeHttpClientDriver } from './fake-http-client.driver';
import type { HttpClientDriverRegistry } from './http-client-driver.registry';
import { HttpClientService } from './http-client.service';
import { HttpResilienceService } from './http-resilience.service';

function clientOn(driver: FakeHttpClientDriver): HttpClientService {
  return new HttpClientService(
    { active: driver } as unknown as HttpClientDriverRegistry,
    new HttpResilienceService({}, {} as HealthRegistry),
  );
}

describe('tenant isolation', () => {
  it('sends each tenant request with its own body and headers only, even concurrently', async () => {
    const driver = new FakeHttpClientDriver();
    const sent: Array<{ headers?: Record<string, string>; body?: unknown }> =
      [];
    const request = driver.request.bind(driver);
    jest.spyOn(driver, 'request').mockImplementation((options) => {
      sent.push({
        headers: options.headers,
        body: options.body,
      });
      return request(options);
    });
    driver.stub('https://api.example.com/*', { body: { ok: true } });
    const client = clientOn(driver);

    await Promise.all([
      TenantContextStorage.run({ tenantId: 'tenant-a' }, () =>
        client.post(
          'https://api.example.com/orders',
          { tenant: 'tenant-a' },
          { headers: { authorization: 'Bearer secret-of-a' } },
        ),
      ),
      TenantContextStorage.run({ tenantId: 'tenant-b' }, () =>
        client.post(
          'https://api.example.com/orders',
          { tenant: 'tenant-b' },
          { headers: { authorization: 'Bearer secret-of-b' } },
        ),
      ),
    ]);

    expect(sent).toHaveLength(2);
    for (const call of sent) {
      const tenant = (call.body as { tenant: string }).tenant;
      const other = tenant === 'tenant-a' ? 'b' : 'a';

      expect(call.headers?.authorization).toBe(
        `Bearer secret-of-${tenant.slice(-1)}`,
      );
      expect(JSON.stringify(call)).not.toContain(`secret-of-${other}`);
    }
  });

  it('keeps nothing of a tenant A call in the options of a later tenant B call', async () => {
    const driver = new FakeHttpClientDriver();
    driver.stub('https://api.example.com/*', { body: {} });
    const client = clientOn(driver);

    await TenantContextStorage.run({ tenantId: 'tenant-a' }, () =>
      client.get('https://api.example.com/me', {
        query: { token: 'secret-of-a' },
      }),
    );
    await TenantContextStorage.run({ tenantId: 'tenant-b' }, () =>
      client.get('https://api.example.com/me'),
    );

    expect(driver.recorded[1]).toEqual({
      method: 'GET',
      url: 'https://api.example.com/me',
      query: undefined,
      body: undefined,
    });
  });
});
