import { ExecutionContext } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { LockService } from '#technical/lock/lock.service';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { IdempotencyKeyStore } from './idempotency-key.store';
import type { IdempotencyRecord } from './idempotency-key.store';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { hashBody, IDEMPOTENCY_TTL_MS, isExpired } from './idempotency.util';

const TENANT_ID = 'tenant-1';
const BODY = { name: 'Acme' };

interface Mocks {
  storeFns: Record<
    'findRecord' | 'createPending' | 'complete' | 'discard',
    jest.Mock
  >;
  lockService: { acquire: jest.Mock };
  release: jest.Mock;
  response: { status: jest.Mock; setHeader: jest.Mock; getHeaders: jest.Mock };
}

function buildContext(
  method: string,
  headers: Record<string, string>,
  mocks: Mocks,
): ExecutionContext {
  const request = {
    method,
    path: '/teams',
    route: { path: '/teams' },
    body: BODY,
    header: (name: string) => headers[name.toLowerCase()],
  };

  return {
    getType: () => 'http',
    getHandler: () => function handler() {},
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => mocks.response,
    }),
  } as unknown as ExecutionContext;
}

function buildMocks(): Mocks {
  const release = jest.fn().mockResolvedValue(undefined);

  return {
    storeFns: {
      findRecord: jest.fn().mockResolvedValue(null),
      createPending: jest.fn().mockResolvedValue(undefined),
      complete: jest.fn().mockResolvedValue(undefined),
      discard: jest.fn().mockResolvedValue(undefined),
    },
    lockService: { acquire: jest.fn().mockResolvedValue({ release }) },
    release,
    response: {
      status: jest.fn(),
      setHeader: jest.fn(),
      getHeaders: jest.fn().mockReturnValue({ 'x-custom': 'yes' }),
    },
  };
}

function completedRecord(
  overrides: Partial<IdempotencyRecord> = {},
): IdempotencyRecord {
  return {
    createdAt: new Date(),
    status: 'completed',
    route: 'POST /teams',
    bodyHash: hashBody(BODY),
    statusCode: 201,
    responseBody: { data: { id: 'a' } },
    responseHeaders: { 'x-custom': 'yes' },
    ...overrides,
  };
}

describe('IdempotencyInterceptor', () => {
  let mocks: Mocks;
  let interceptor: IdempotencyInterceptor;
  const handle = jest.fn();

  function run(
    method = 'POST',
    headers: Record<string, string> = { 'idempotency-key': 'k1' },
  ): Promise<unknown> {
    const context = buildContext(method, headers, mocks);

    return TenantContextStorage.run({ tenantId: TENANT_ID }, async () => {
      const stream = await interceptor.intercept(context, { handle });
      return new Promise((resolve, reject) => {
        stream.subscribe({ next: resolve, error: reject });
      });
    });
  }

  beforeEach(() => {
    mocks = buildMocks();
    handle.mockReset();
    handle.mockReturnValue(of({ data: { id: 'a' } }));
    interceptor = new IdempotencyInterceptor(
      mocks.storeFns as unknown as IdempotencyKeyStore,
      mocks.lockService as unknown as LockService,
    );
  });

  it('passes through without a key', async () => {
    await run('POST', {});

    expect(handle).toHaveBeenCalledTimes(1);
    expect(mocks.lockService.acquire).not.toHaveBeenCalled();
  });

  it('passes through on a non-mutating method', async () => {
    await run('GET');

    expect(handle).toHaveBeenCalledTimes(1);
    expect(mocks.storeFns.createPending).not.toHaveBeenCalled();
  });

  it('passes through when the key is absurdly long', async () => {
    await run('POST', { 'idempotency-key': 'x'.repeat(256) });

    expect(mocks.storeFns.createPending).not.toHaveBeenCalled();
  });

  it('writes the pending record before the handler runs, then completes it', async () => {
    const order: string[] = [];
    mocks.storeFns.createPending.mockImplementation(() => {
      order.push('pending');
      return Promise.resolve();
    });
    handle.mockImplementation(() => {
      order.push('handler');
      return of({ data: { id: 'a' } });
    });

    const result = await run();

    expect(order).toEqual(['pending', 'handler']);
    expect(result).toEqual({ data: { id: 'a' } });
    expect(mocks.storeFns.complete).toHaveBeenCalledWith(
      TENANT_ID,
      'k1',
      201,
      { data: { id: 'a' } },
      { 'x-custom': 'yes' },
    );
    expect(mocks.release).toHaveBeenCalled();
  });

  it('replays a completed record without running the handler', async () => {
    mocks.storeFns.findRecord.mockResolvedValue(completedRecord());

    const result = await run();

    expect(result).toEqual({ data: { id: 'a' } });
    expect(handle).not.toHaveBeenCalled();
    expect(mocks.response.status).toHaveBeenCalledWith(201);
    expect(mocks.response.setHeader).toHaveBeenCalledWith('x-custom', 'yes');
  });

  it('rejects a repeat with a different body as a 422', async () => {
    mocks.storeFns.findRecord.mockResolvedValue(
      completedRecord({ bodyHash: 'other' }),
    );

    await expect(run()).rejects.toMatchObject({ status: 422 });
    expect(handle).not.toHaveBeenCalled();
  });

  it('rejects the same key on a different route as a 422', async () => {
    mocks.storeFns.findRecord.mockResolvedValue(
      completedRecord({ route: 'POST /other' }),
    );

    await expect(run()).rejects.toMatchObject({ status: 422 });
  });

  it('runs the handler again when the stored record has expired', async () => {
    mocks.storeFns.findRecord.mockResolvedValue(
      completedRecord({
        createdAt: new Date(Date.now() - IDEMPOTENCY_TTL_MS - 1000),
      }),
    );

    await run();

    expect(handle).toHaveBeenCalledTimes(1);
    expect(mocks.storeFns.createPending).toHaveBeenCalled();
  });

  it('discards the record and rethrows when the handler fails', async () => {
    handle.mockReturnValue(throwError(() => new Error('boom')));

    await expect(run()).rejects.toThrow('boom');

    expect(mocks.storeFns.discard).toHaveBeenLastCalledWith(TENANT_ID, 'k1');
    expect(mocks.storeFns.complete).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalled();
  });

  it('replays the winner answer when the lock is held by a concurrent request', async () => {
    mocks.lockService.acquire.mockResolvedValue(null);
    mocks.storeFns.findRecord
      .mockResolvedValueOnce(completedRecord({ status: 'pending' }))
      .mockResolvedValueOnce(completedRecord());

    const result = await run();

    expect(result).toEqual({ data: { id: 'a' } });
    expect(handle).not.toHaveBeenCalled();
  });

  it('scopes the lock and the record to the tenant', async () => {
    await run();

    expect(mocks.lockService.acquire).toHaveBeenCalledWith(
      `idempotency:${TENANT_ID}:k1`,
      expect.anything(),
    );
    expect(mocks.storeFns.createPending).toHaveBeenCalledWith(
      TENANT_ID,
      'k1',
      'POST /teams',
      hashBody(BODY),
    );
  });

  it('knows when a record is past its 24h life', () => {
    const now = Date.now();

    expect(isExpired(new Date(now - IDEMPOTENCY_TTL_MS + 1000), now)).toBe(
      false,
    );
    expect(isExpired(new Date(now - IDEMPOTENCY_TTL_MS), now)).toBe(true);
  });
});
