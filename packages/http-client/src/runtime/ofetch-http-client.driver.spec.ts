// ofetch is a dependency of this package, installed by `hery install
// http-client`, and absent from the framework repository. The virtual mock
// stands in for it so the retry and timeout policy stays testable here --
// nothing in these tests exercises ofetch itself, only the loop around it.
jest.mock('ofetch', () => ({ ofetch: { raw: jest.fn() } }), { virtual: true });

import {
  HttpRequestFailedException,
  HttpRequestTimeoutException,
} from '#kernel/http-client/http-client.exception';
import { OfetchHttpClientDriver } from './ofetch-http-client.driver';
import type {
  HttpFetcher,
  HttpFetcherResult,
} from './ofetch-http-client.driver';

const slept: number[] = [];

function noSleep(ms: number): Promise<void> {
  slept.push(ms);

  return Promise.resolve();
}

function ok(body: unknown = { ok: true }): HttpFetcherResult {
  return { status: 200, headers: {}, body };
}

function buildDriver(fetcher: HttpFetcher): OfetchHttpClientDriver {
  return new OfetchHttpClientDriver(fetcher, noSleep);
}

describe('OfetchHttpClientDriver', () => {
  beforeEach(() => {
    slept.length = 0;
  });

  it('returns a 2xx without retrying', async () => {
    const fetcher = jest.fn<
      Promise<HttpFetcherResult>,
      Parameters<HttpFetcher>
    >(() =>
      Promise.resolve({ status: 200, headers: { etag: 'x' }, body: { id: 1 } }),
    );

    const response = await buildDriver(fetcher).request({
      method: 'GET',
      url: 'https://api.example.com/users/1',
    });

    expect(response).toEqual({
      status: 200,
      ok: true,
      headers: { etag: 'x' },
      body: { id: 1 },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(slept).toEqual([]);
  });

  it('retries a 5xx with exponential backoff and returns the first success', async () => {
    let attempts = 0;
    const fetcher: HttpFetcher = () => {
      attempts += 1;

      return Promise.resolve(
        attempts < 3
          ? { status: 503, headers: {}, body: 'busy' }
          : ok({ id: 1 }),
      );
    };

    const response = await buildDriver(fetcher).request({
      method: 'GET',
      url: 'https://api.example.com/users/1',
    });

    expect(response.body).toEqual({ id: 1 });
    expect(attempts).toBe(3);
    expect(slept).toEqual([100, 200]);
  });

  it('retries a 429 as well, since the remote asked for it', async () => {
    let attempts = 0;
    const fetcher: HttpFetcher = () => {
      attempts += 1;

      return Promise.resolve(
        attempts === 1 ? { status: 429, headers: {}, body: null } : ok(),
      );
    };

    await buildDriver(fetcher).request({
      method: 'GET',
      url: 'https://api.example.com/users/1',
    });

    expect(attempts).toBe(2);
  });

  /**
   * A 400 will be a 400 again in 200ms, so retrying it only delays an error
   * the call had already earned -- and triples the load doing it.
   */
  it("does not retry a 4xx, which is this side's own mistake", async () => {
    let attempts = 0;
    const fetcher: HttpFetcher = () => {
      attempts += 1;

      return Promise.resolve({
        status: 422,
        headers: {},
        body: { error: 'bad email' },
      });
    };

    await expect(
      buildDriver(fetcher).request({
        method: 'POST',
        url: 'https://api.example.com/users',
      }),
    ).rejects.toThrow(HttpRequestFailedException);
    expect(attempts).toBe(1);
  });

  it('gives up after the configured number of retries', async () => {
    const fetcher: HttpFetcher = () =>
      Promise.resolve({ status: 500, headers: {}, body: 'boom' });

    await expect(
      buildDriver(fetcher).request({
        method: 'GET',
        url: 'https://api.example.com/users/1',
        retries: 1,
      }),
    ).rejects.toThrow(/answered 500/);
    expect(slept).toEqual([100]);
  });

  /**
   * The rule that keeps an API key out of the logs: the exception carries the
   * status and the response body, and never the request headers it was sent
   * with.
   */
  it('reports the status and body of a failure without the request headers', async () => {
    const fetcher: HttpFetcher = () =>
      Promise.resolve({
        status: 403,
        headers: {},
        body: { error: 'forbidden' },
      });

    const failure = await buildDriver(fetcher)
      .request({
        method: 'GET',
        url: 'https://api.example.com/users/1',
        headers: { authorization: 'Bearer super-secret' },
      })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(HttpRequestFailedException);
    expect(JSON.stringify(failure)).not.toContain('super-secret');
    expect((failure as HttpRequestFailedException).details).toEqual({
      method: 'GET',
      url: 'https://api.example.com/users/1',
      status: 403,
      body: { error: 'forbidden' },
    });
  });

  it('aborts a request that outlives its timeout and reports it as a timeout', async () => {
    const fetcher: HttpFetcher = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () =>
          reject(new Error('aborted')),
        );
      });

    await expect(
      buildDriver(fetcher).request({
        method: 'GET',
        url: 'https://api.example.com/slow',
        timeoutMs: 5,
        retries: 0,
      }),
    ).rejects.toThrow(HttpRequestTimeoutException);
  });

  it('retries a timeout before giving up on it', async () => {
    let attempts = 0;
    const fetcher: HttpFetcher = (_url, init) => {
      attempts += 1;

      if (attempts > 1) {
        return Promise.resolve(ok());
      }

      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () =>
          reject(new Error('aborted')),
        );
      });
    };

    const response = await buildDriver(fetcher).request({
      method: 'GET',
      url: 'https://api.example.com/slow',
      timeoutMs: 5,
    });

    expect(response.ok).toBe(true);
    expect(attempts).toBe(2);
  });

  it('retries a transport failure and wraps it rather than leaking the cause', async () => {
    let attempts = 0;
    const fetcher: HttpFetcher = () => {
      attempts += 1;

      return Promise.reject(new Error('ECONNREFUSED'));
    };

    await expect(
      buildDriver(fetcher).request({
        method: 'GET',
        url: 'https://api.example.com/users/1',
        retries: 1,
      }),
    ).rejects.toThrow(HttpRequestFailedException);
    expect(attempts).toBe(2);
  });

  it('clears the timeout once a request answers, so the process can exit', async () => {
    const fetcher: HttpFetcher = () => Promise.resolve(ok());
    const cleared = jest.spyOn(global, 'clearTimeout');

    await buildDriver(fetcher).request({
      method: 'GET',
      url: 'https://api.example.com/users/1',
    });

    expect(cleared).toHaveBeenCalled();
    cleared.mockRestore();
  });
});
