import { UnstubbedHttpRequestException } from '#kernel/http-client/http-client.exception';
import { FakeHttpClientDriver } from './fake-http-client.driver';

describe('FakeHttpClientDriver', () => {
  let driver: FakeHttpClientDriver;

  beforeEach(() => {
    driver = new FakeHttpClientDriver();
  });

  it('answers a stubbed URL with the canned response', async () => {
    driver.stub('https://api.example.com/users/42', {
      status: 201,
      headers: { 'content-type': 'application/json' },
      body: { id: 42 },
    });

    const response = await driver.request({
      method: 'GET',
      url: 'https://api.example.com/users/42',
    });

    expect(response).toEqual({
      status: 201,
      ok: true,
      headers: { 'content-type': 'application/json' },
      body: { id: 42 },
    });
  });

  it('matches a whole endpoint family through a wildcard', async () => {
    driver.stub('https://api.example.com/users/*', { body: { ok: true } });

    const response = await driver.request({
      method: 'GET',
      url: 'https://api.example.com/users/7/roles',
    });

    expect(response.body).toEqual({ ok: true });
  });

  it('does not let a stub answer for a URL it only partially matches', async () => {
    driver.stub('https://api.example.com/users', {});

    await expect(
      driver.request({
        method: 'GET',
        url: 'https://api.example.com/users/7',
      }),
    ).rejects.toThrow(UnstubbedHttpRequestException);
  });

  it('records every request, including the ones no stub answered', async () => {
    driver.stub('https://api.example.com/ping', {});

    await driver.request({
      method: 'GET',
      url: 'https://api.example.com/ping',
    });
    await expect(
      driver.request({
        method: 'POST',
        url: 'https://api.example.com/orders',
        body: { total: 10 },
      }),
    ).rejects.toThrow(UnstubbedHttpRequestException);

    expect(driver.recorded).toEqual([
      { method: 'GET', url: 'https://api.example.com/ping' },
      {
        method: 'POST',
        url: 'https://api.example.com/orders',
        body: { total: 10 },
      },
    ]);
  });

  /**
   * The safety property the whole default rests on: a test that forgets to
   * stub an endpoint must fail here, not reach a real third party from CI.
   */
  it('refuses an unstubbed URL and names what is stubbed', async () => {
    driver.stub('https://api.example.com/users/*', {});

    await expect(
      driver.request({ method: 'GET', url: 'https://evil.example.com/' }),
    ).rejects.toThrow(/No stub matches GET https:\/\/evil.example.com\//);

    await expect(
      driver.request({ method: 'GET', url: 'https://evil.example.com/' }),
    ).rejects.toThrow(
      /Currently stubbed: https:\/\/api.example.com\/users\/\*/,
    );
  });

  it('says nothing is stubbed when nothing is', async () => {
    await expect(
      driver.request({ method: 'GET', url: 'https://api.example.com/ping' }),
    ).rejects.toThrow(/Currently stubbed: nothing/);
  });

  it('lets a later stub override an earlier one on the same pattern', async () => {
    driver.stub('https://api.example.com/ping', { status: 200 });
    driver.stub('https://api.example.com/ping', { status: 503 });

    const response = await driver.request({
      method: 'GET',
      url: 'https://api.example.com/ping',
    });

    expect(response.status).toBe(503);
    expect(response.ok).toBe(false);
  });

  it('forgets stubs and recordings on reset', async () => {
    driver.stub('https://api.example.com/ping', {});
    await driver.request({
      method: 'GET',
      url: 'https://api.example.com/ping',
    });

    driver.reset();

    expect(driver.recorded).toHaveLength(0);
    await expect(
      driver.request({ method: 'GET', url: 'https://api.example.com/ping' }),
    ).rejects.toThrow(UnstubbedHttpRequestException);
  });
});
