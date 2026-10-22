import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import type { AuthenticatedUser } from '#technical/auth/auth.types';
import { CacheService } from '#technical/cache/cache.service';
import { modelChangeMessages } from '#technical/outbox/outbox-stage';
import { OutboxRegistry } from '#technical/outbox/outbox.registry';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { CacheOutput } from './cache-output.decorator';
import { OUTPUT_CACHE_PREFIX } from './output-cache-key';
import { OutputCacheInterceptor } from './output-cache.interceptor';
import { OutputCacheInvalidator } from './output-cache.invalidator';
import {
  OutputCacheStats,
  outputCacheRequestsTotal,
} from './output-cache.stats';

class PostsController {
  @CacheOutput({ ttlSeconds: 60, models: ['Post'] })
  list() {
    return undefined;
  }

  uncached() {
    return undefined;
  }
}

function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'user-1',
    email: 'user@example.com',
    tenantId: 'tenant-a',
    teamIds: [],
    currentTeamId: null,
    role: 'member',
    impersonatedBy: null,
    ...overrides,
  };
}

interface Call {
  tenantId: string;
  caller?: AuthenticatedUser;
  url?: string;
  method?: string;
  handler?: keyof PostsController;
  body: unknown;
}

describe('OutputCacheInterceptor', () => {
  const cache = new CacheService();
  const stats = new OutputCacheStats();
  const interceptor = new OutputCacheInterceptor(new Reflector(), cache, stats);
  const invalidator = new OutputCacheInvalidator(new OutboxRegistry(), cache);
  const tenants = ['tenant-a', 'tenant-b'];

  async function call({
    tenantId,
    caller = user({ tenantId }),
    url = '/posts?page=1',
    method = 'GET',
    handler = 'list',
    body,
  }: Call) {
    const headers = new Map<string, string>();
    const request = {
      method,
      originalUrl: url,
      route: { path: '/posts' },
      user: caller,
      header: () => undefined,
    };
    const response = {
      statusCode: 200,
      setHeader: (name: string, value: string) => headers.set(name, value),
    };
    const context = {
      getType: () => 'http',
      getHandler: () =>
        Object.getOwnPropertyDescriptor(PostsController.prototype, handler)
          ?.value as unknown,
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;
    const handle = jest.fn(() => of(body));
    const next: CallHandler = { handle };

    const result = await TenantContextStorage.run(
      { tenantId, userId: caller.id },
      () => lastValueFrom(interceptor.intercept(context, next)),
    );

    return {
      result,
      ranHandler: handle.mock.calls.length > 0,
      header: headers.get('X-Output-Cache'),
    };
  }

  function writeTo(model: string, tenantId: string) {
    return invalidator.handle({
      id: 'message-1',
      name: `model.${model}.updated`,
      payload: { model, kind: 'updated', tenantId },
      tenantId,
      attempt: 1,
      createdAt: new Date(),
    });
  }

  afterEach(async () => {
    for (const tenantId of tenants) {
      await TenantContextStorage.run({ tenantId }, () =>
        cache.invalidate(OUTPUT_CACHE_PREFIX),
      );
    }
  });

  afterAll(async () => {
    await cache.onModuleDestroy();
  });

  it('serves the second identical read from the cache without the handler', async () => {
    const first = await call({ tenantId: 'tenant-a', body: ['a-post'] });
    const second = await call({ tenantId: 'tenant-a', body: ['changed'] });

    expect(first).toMatchObject({ ranHandler: true, header: 'MISS' });
    expect(second).toEqual({
      result: ['a-post'],
      ranHandler: false,
      header: 'HIT',
    });
  });

  it('never serves one tenant what another tenant cached at the same URL', async () => {
    const caller = user({ id: 'shared-user-id' });

    await call({ tenantId: 'tenant-a', caller, body: ['a-secret'] });
    const other = await call({ tenantId: 'tenant-b', caller, body: ['b-own'] });

    expect(other).toMatchObject({ result: ['b-own'], ranHandler: true });
  });

  it('never serves a caller what a caller with another scope cached', async () => {
    await call({
      tenantId: 'tenant-a',
      caller: user({ id: 'admin', role: 'admin' }),
      body: ['every-post'],
    });

    const member = await call({
      tenantId: 'tenant-a',
      caller: user({ id: 'member' }),
      body: ['own-posts'],
    });
    const otherTeam = await call({
      tenantId: 'tenant-a',
      caller: user({ id: 'admin', role: 'admin', currentTeamId: 'team-2' }),
      body: ['team-2-posts'],
    });
    const impersonated = await call({
      tenantId: 'tenant-a',
      caller: user({ id: 'admin', role: 'admin', impersonatedBy: 'root' }),
      body: ['as-impersonated'],
    });

    expect(member).toMatchObject({ result: ['own-posts'], ranHandler: true });
    expect(otherTeam).toMatchObject({ ranHandler: true });
    expect(impersonated).toMatchObject({ ranHandler: true });
  });

  it('keys on the query string', async () => {
    await call({ tenantId: 'tenant-a', url: '/posts?page=1', body: [1] });
    const page2 = await call({
      tenantId: 'tenant-a',
      url: '/posts?page=2',
      body: [2],
    });

    expect(page2).toMatchObject({ result: [2], ranHandler: true });
  });

  it('drops the tenant entries when the outbox reports a write to the model', async () => {
    await call({ tenantId: 'tenant-a', body: ['stale'] });
    await call({ tenantId: 'tenant-b', body: ['b-kept'] });

    await writeTo('Post', 'tenant-a');

    expect(await call({ tenantId: 'tenant-a', body: ['fresh'] })).toMatchObject(
      { result: ['fresh'], ranHandler: true },
    );
    expect(
      await call({ tenantId: 'tenant-b', body: ['ignored'] }),
    ).toMatchObject({ result: ['b-kept'], ranHandler: false });
  });

  it('stops serving a reader by share the record once the share is revoked', async () => {
    const reader = user({ id: 'reader' });
    await call({ tenantId: 'tenant-a', caller: reader, body: ['shared-post'] });
    const revoked = TenantContextStorage.run(
      { tenantId: 'tenant-a', userId: 'owner' },
      () =>
        modelChangeMessages({
          model: 'RecordShare',
          operation: 'delete',
          args: { where: { id: 'share-1' } },
          result: {
            id: 'share-1',
            resource: 'Post',
            recordId: 'post-1',
            granteeType: 'user',
            granteeId: 'reader',
            access: 'read',
          },
          tenantId: 'tenant-a',
        }),
    );

    for (const message of revoked) {
      await invalidator.handle({
        id: message.name,
        name: message.name,
        payload: message.payload,
        tenantId: message.tenantId,
        attempt: 1,
        createdAt: new Date(),
      });
    }

    expect(
      await call({ tenantId: 'tenant-a', caller: reader, body: [] }),
    ).toMatchObject({ result: [], ranHandler: true, header: 'MISS' });
  });

  it('ignores a write to a model whose name only starts the same', async () => {
    await call({ tenantId: 'tenant-a', body: ['kept'] });

    await writeTo('PostTag', 'tenant-a');

    expect(
      await call({ tenantId: 'tenant-a', body: ['ignored'] }),
    ).toMatchObject({ result: ['kept'], ranHandler: false });
  });

  it('leaves non-GET requests and undecorated routes alone', async () => {
    const post = await call({
      tenantId: 'tenant-a',
      method: 'POST',
      body: 'created',
    });
    const plain = await call({
      tenantId: 'tenant-a',
      handler: 'uncached',
      body: 'plain',
    });

    expect(post.header).toBeUndefined();
    expect(plain.header).toBeUndefined();
  });

  it('counts hits and misses per route for the admin and the scrape', async () => {
    const before = stats.list().find((entry) => entry.route === '/posts');

    await call({ tenantId: 'tenant-a', body: [] });
    await call({ tenantId: 'tenant-a', body: [] });

    const after = stats.list().find((entry) => entry.route === '/posts');
    const scraped = await outputCacheRequestsTotal.get();

    expect(after?.hits).toBe((before?.hits ?? 0) + 1);
    expect(after?.misses).toBe((before?.misses ?? 0) + 1);
    expect(after).toMatchObject({ models: 'Post', ttlSeconds: 60 });
    expect(
      scraped.values.some((value) => {
        const labels = value.labels as Record<string, unknown>;

        return labels.route === '/posts' && labels.result === 'hit';
      }),
    ).toBe(true);
  });
});
