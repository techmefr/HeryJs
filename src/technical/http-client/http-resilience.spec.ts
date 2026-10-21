import {
  HttpBulkheadFullException,
  HttpCircuitOpenException,
  HttpRequestFailedException,
  HttpRequestTimeoutException,
} from './http-client.exception';
import type { HttpResponse } from './http-client-driver';
import { HttpResilience } from './http-resilience';

const URL_A = 'https://a.example.com/users';
const URL_B = 'https://b.example.com/users';

function answer(status: number): HttpResponse {
  return { status, ok: status < 300, headers: {}, body: null };
}

class Time {
  now = 1_000;
  readonly clock = () => this.now;
}

function build(config: ConstructorParameters<typeof HttpResilience>[0] = {}): {
  resilience: HttpResilience;
  time: Time;
} {
  const time = new Time();

  return { resilience: new HttpResilience(config, time.clock), time };
}

async function fail(resilience: HttpResilience, url: string, times: number) {
  for (let call = 0; call < times; call += 1) {
    await resilience
      .run(url, () =>
        Promise.reject(new HttpRequestFailedException('GET', url, 503, null)),
      )
      .catch(() => undefined);
  }
}

describe('HttpResilience circuit breaker', () => {
  it('opens after the configured run of failures and then fails fast without calling the host', async () => {
    const { resilience } = build({ failureThreshold: 3 });
    const call = jest.fn(() => Promise.resolve(answer(200)));

    await fail(resilience, URL_A, 3);

    await expect(resilience.run(URL_A, call)).rejects.toBeInstanceOf(
      HttpCircuitOpenException,
    );
    expect(call).not.toHaveBeenCalled();
    expect(resilience.find('a.example.com')?.snapshot().state).toBe('open');
  });

  it('answers with a typed error that says when to come back', async () => {
    const { resilience, time } = build({ failureThreshold: 1, openMs: 10_000 });
    await fail(resilience, URL_A, 1);
    time.now += 4_000;

    await expect(
      resilience.run(URL_A, () => Promise.resolve(answer(200))),
    ).rejects.toMatchObject({
      key: 'http.circuit-open',
      host: 'a.example.com',
      retryAfterMs: 6_000,
    });
  });

  it('counts timeouts, transport failures and 429 or 5xx answers, but not a 4xx', async () => {
    const { resilience } = build({ failureThreshold: 3 });

    await resilience
      .run(URL_A, () =>
        Promise.reject(new HttpRequestTimeoutException('GET', URL_A, 100)),
      )
      .catch(() => undefined);
    await resilience
      .run(URL_A, () =>
        Promise.reject(new HttpRequestFailedException('GET', URL_A, 0, 'dns')),
      )
      .catch(() => undefined);
    await resilience.run(URL_A, () => Promise.resolve(answer(429)));

    expect(resilience.find('a.example.com')?.snapshot().state).toBe('open');

    const other = build({ failureThreshold: 2 });

    await other.resilience
      .run(URL_B, () =>
        Promise.reject(new HttpRequestFailedException('GET', URL_B, 404, null)),
      )
      .catch(() => undefined);
    await other.resilience
      .run(URL_B, () =>
        Promise.reject(new HttpRequestFailedException('GET', URL_B, 422, null)),
      )
      .catch(() => undefined);
    await other.resilience.run(URL_B, () => Promise.resolve(answer(400)));

    expect(other.resilience.find('b.example.com')?.snapshot()).toMatchObject({
      state: 'closed',
      consecutiveFailures: 0,
    });
  });

  it('needs the failures to be consecutive: a success resets the count', async () => {
    const { resilience } = build({ failureThreshold: 3 });

    await fail(resilience, URL_A, 2);
    await resilience.run(URL_A, () => Promise.resolve(answer(200)));
    await fail(resilience, URL_A, 2);

    expect(resilience.find('a.example.com')?.snapshot().state).toBe('closed');
  });

  it('lets one probe through after the cooldown and closes when it succeeds', async () => {
    const { resilience, time } = build({ failureThreshold: 1, openMs: 5_000 });
    await fail(resilience, URL_A, 1);
    time.now += 5_000;

    expect(resilience.find('a.example.com')?.snapshot().state).toBe(
      'half-open',
    );

    await resilience.run(URL_A, () => Promise.resolve(answer(200)));

    expect(resilience.find('a.example.com')?.snapshot()).toMatchObject({
      state: 'closed',
      openedAt: null,
    });
  });

  it('reopens when the probe fails, and refuses a second probe while one is out', async () => {
    const { resilience, time } = build({
      failureThreshold: 1,
      openMs: 5_000,
      halfOpenProbes: 1,
    });
    await fail(resilience, URL_A, 1);
    time.now += 5_000;

    let release: (response: HttpResponse) => void = () => undefined;
    const probe = resilience.run(
      URL_A,
      () => new Promise<HttpResponse>((resolve) => (release = resolve)),
    );

    await expect(
      resilience.run(URL_A, () => Promise.resolve(answer(200))),
    ).rejects.toBeInstanceOf(HttpCircuitOpenException);

    release(answer(503));
    await probe;

    expect(resilience.find('a.example.com')?.snapshot().state).toBe('open');
  });

  it('keeps one host from tripping another', async () => {
    const { resilience } = build({ failureThreshold: 1 });
    await fail(resilience, URL_A, 1);

    await expect(
      resilience.run(URL_B, () => Promise.resolve(answer(200))),
    ).resolves.toMatchObject({ status: 200 });
  });

  it('takes thresholds per host from the configuration', async () => {
    const { resilience } = build({
      failureThreshold: 5,
      hosts: { 'a.example.com': { failureThreshold: 1 } },
    });

    await fail(resilience, URL_A, 1);
    await fail(resilience, URL_B, 1);

    expect(resilience.find('a.example.com')?.snapshot().state).toBe('open');
    expect(resilience.find('b.example.com')?.snapshot().state).toBe('closed');
  });

  it('can be tripped and cleared by an operator, and re-tuned at runtime', async () => {
    const { resilience } = build();
    await resilience.run(URL_A, () => Promise.resolve(answer(200)));
    const gate = resilience.gateFor('a.example.com');

    gate.open();
    await expect(
      resilience.run(URL_A, () => Promise.resolve(answer(200))),
    ).rejects.toBeInstanceOf(HttpCircuitOpenException);

    gate.reset();
    await expect(
      resilience.run(URL_A, () => Promise.resolve(answer(200))),
    ).resolves.toMatchObject({ status: 200 });

    resilience.configure('a.example.com', { failureThreshold: 1 });
    await fail(resilience, URL_A, 1);

    expect(gate.snapshot()).toMatchObject({
      state: 'open',
      settings: { failureThreshold: 1 },
    });
  });

  it('does nothing at all when switched off', async () => {
    const { resilience } = build({ enabled: false, failureThreshold: 1 });

    await fail(resilience, URL_A, 5);

    expect(resilience.snapshots()).toEqual([]);
  });
});

describe('HttpResilience bulkhead', () => {
  it('refuses calls beyond the concurrency limit and frees a slot when one finishes', async () => {
    const { resilience } = build({ maxConcurrent: 2 });
    const releases: ((response: HttpResponse) => void)[] = [];
    const pending = () =>
      new Promise<HttpResponse>((resolve) => releases.push(resolve));

    const first = resilience.run(URL_A, pending);
    const second = resilience.run(URL_A, pending);

    await expect(
      resilience.run(URL_A, () => Promise.resolve(answer(200))),
    ).rejects.toBeInstanceOf(HttpBulkheadFullException);
    expect(resilience.find('a.example.com')?.snapshot()).toMatchObject({
      inFlight: 2,
      rejectedByBulkhead: 1,
    });

    releases[0]?.(answer(200));
    await first;

    await expect(
      resilience.run(URL_A, () => Promise.resolve(answer(200))),
    ).resolves.toMatchObject({ status: 200 });

    releases[1]?.(answer(200));
    await second;
  });

  it('does not count a refused call as a failure of the host', async () => {
    const { resilience } = build({ maxConcurrent: 1, failureThreshold: 1 });
    let release: (response: HttpResponse) => void = () => undefined;
    const held = resilience.run(
      URL_A,
      () => new Promise<HttpResponse>((resolve) => (release = resolve)),
    );

    await resilience
      .run(URL_A, () => Promise.resolve(answer(200)))
      .catch(() => undefined);

    expect(resilience.find('a.example.com')?.snapshot().state).toBe('closed');

    release(answer(200));
    await held;
  });
});
