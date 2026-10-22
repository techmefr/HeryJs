import { HttpLogDriver, lokiPushBody } from './http-log.driver';
import { parseLogLine } from './log-line';

function entry(level: number, message: string, time: number) {
  return parseLogLine(JSON.stringify({ level, msg: message, time }));
}

describe('lokiPushBody', () => {
  it('groups by level and stamps nanoseconds', () => {
    const body = lokiPushBody('heryjs', [
      entry(30, 'a', 1700000000123),
      entry(50, 'b', 1700000000456),
      entry(30, 'c', 1700000000789),
    ]);

    expect(body.streams).toHaveLength(2);
    expect(body.streams.find((s) => s.stream.level === 'info')).toMatchObject({
      stream: { app: 'heryjs', level: 'info' },
      values: [
        ['1700000000123000000', expect.stringContaining('"msg":"a"') as string],
        ['1700000000789000000', expect.stringContaining('"msg":"c"') as string],
      ],
    });
  });

  it('puts only app and level in the labels', () => {
    const body = lokiPushBody('heryjs', [
      parseLogLine('{"level":30,"msg":"a","tenantId":"acme","time":1}'),
    ]);

    expect(Object.keys(body.streams[0]?.stream ?? {})).toEqual([
      'app',
      'level',
    ]);
  });
});

describe('HttpLogDriver', () => {
  const REPORT_INTERVAL_PAST = 60_000;
  const options = {
    url: 'https://loki.example/loki/api/v1/push',
    token: 'secret-token',
    app: 'heryjs',
    timeoutMs: 1000,
  };

  it('posts the batch with a bearer token', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const driver = new HttpLogDriver({
      ...options,
      fetch: (url, init) => {
        calls.push({
          url: typeof url === 'string' ? url : 'not a string',
          init: init ?? {},
        });
        return Promise.resolve(new Response(null, { status: 204 }));
      },
    });

    driver.write(entry(30, 'a', 1));
    await driver.flush();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(options.url);
    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.init.headers).toMatchObject({
      Authorization: 'Bearer secret-token',
      'Content-Type': 'application/json',
    });
    const body = calls[0]?.init.body;

    expect(JSON.parse(typeof body === 'string' ? body : '{}')).toMatchObject({
      streams: [{ stream: { level: 'info' } }],
    });
  });

  it('sends no Authorization header without a token', async () => {
    let headers: HeadersInit | undefined;
    const driver = new HttpLogDriver({
      ...options,
      token: null,
      fetch: (_url, init) => {
        headers = init?.headers;
        return Promise.resolve(new Response(null, { status: 204 }));
      },
    });

    driver.write(entry(30, 'a', 1));
    await driver.flush();

    expect(headers).not.toHaveProperty('Authorization');
  });

  it('reports a refusing collector instead of throwing', async () => {
    const stderr = jest.spyOn(process.stderr, 'write').mockReturnValue(true);
    const clock = jest
      .spyOn(Date, 'now')
      .mockReturnValue(Date.now() + REPORT_INTERVAL_PAST);
    const driver = new HttpLogDriver({
      ...options,
      fetch: () => Promise.resolve(new Response(null, { status: 503 })),
    });

    driver.write(entry(30, 'a', 1));

    await expect(driver.flush()).resolves.toBeUndefined();
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('503'));

    clock.mockRestore();
    stderr.mockRestore();
  });

  it('survives a collector that cannot be reached', async () => {
    const stderr = jest.spyOn(process.stderr, 'write').mockReturnValue(true);
    const reach = jest.fn(() => Promise.reject(new Error('ECONNREFUSED')));
    const driver = new HttpLogDriver({ ...options, fetch: reach });

    driver.write(entry(30, 'a', 1));

    await expect(driver.flush()).resolves.toBeUndefined();
    expect(reach).toHaveBeenCalledTimes(1);

    stderr.mockRestore();
  });
});
