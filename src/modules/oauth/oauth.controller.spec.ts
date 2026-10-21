import type { Request, Response } from 'express';
import { OAuthAccountService } from './oauth-account.service';
import type { OAuthIdentityStore } from './oauth-identity.store';
import type { OAuthLoginHandler } from './oauth-login.handler';
import { OAuthProviderRegistry } from './oauth-provider.registry';
import { OAuthRefusedException } from './oauth-refused.exception';
import type { OAuthReplayGuard } from './oauth-replay.guard';
import { OAuthStateService, OAUTH_STATE_COOKIE } from './oauth-state.service';
import { OAuthController } from './oauth.controller';
import type {
  OAuthConfig,
  OAuthLoginResult,
  OAuthProfile,
  OAuthProvider,
} from './oauth.types';

const CONFIG: OAuthConfig = {
  linkPolicy: 'link-authenticated',
  isSignUpAllowed: true,
  redirectBaseUrl: 'https://app.test/',
  stateSecret: 'secret',
  isProduction: true,
  credentials: {},
  microsoftTenant: 'common',
};

const PROFILE: OAuthProfile = {
  providerUserId: 'p-1',
  email: 'ada@example.com',
  isEmailVerified: true,
  name: 'Ada',
  avatarUrl: null,
};

class FakeProvider implements OAuthProvider {
  readonly name = 'fake';
  exchanges: { code: string; codeVerifier: string; nonce: string }[] = [];

  authorizationUrl(request: {
    state: string;
    codeChallenge: string;
    redirectUri: string;
  }): string {
    return `https://provider.test/authorize?state=${request.state}&cc=${request.codeChallenge}&ru=${encodeURIComponent(request.redirectUri)}`;
  }

  fetchProfile(exchange: {
    code: string;
    codeVerifier: string;
    nonce: string;
  }): Promise<OAuthProfile> {
    this.exchanges.push(exchange);
    return Promise.resolve(PROFILE);
  }
}

class MemoryReplayGuard implements OAuthReplayGuard {
  private readonly seen = new Set<string>();

  consume(state: string): Promise<boolean> {
    if (this.seen.has(state)) {
      return Promise.resolve(false);
    }

    this.seen.add(state);
    return Promise.resolve(true);
  }
}

function emptyStore(): OAuthIdentityStore {
  const identities = new Map<string, string>();
  const users = new Map<string, { id: string; email: string }>();

  return {
    findLinkedUserId: (provider, id) =>
      Promise.resolve(identities.get(`${provider}:${id}`) ?? null),
    findUser: (id) => {
      const user = users.get(id);
      return Promise.resolve(
        user ? { ...user, isEmailVerified: true, isBanned: false } : null,
      );
    },
    findUserByEmail: () => Promise.resolve(null),
    createUser: (user) => {
      const created = { id: `u-${users.size + 1}`, email: user.email };
      users.set(created.id, created);
      return Promise.resolve({
        ...created,
        isEmailVerified: true,
        isBanned: false,
      });
    },
    linkIdentity: (provider, id, userId) => {
      identities.set(`${provider}:${id}`, userId);
      return Promise.resolve(true);
    },
    removeIdentity: () => Promise.resolve(),
  };
}

function build() {
  const provider = new FakeProvider();
  const registry = new OAuthProviderRegistry(CONFIG, () =>
    Promise.reject(new Error('no network')),
  );
  registry.register(provider);
  const states = new OAuthStateService(CONFIG);
  const results: OAuthLoginResult[] = [];
  const handler: OAuthLoginHandler = {
    handle: (result) => {
      results.push(result);
    },
  };
  const controller = new OAuthController(
    CONFIG,
    handler,
    new MemoryReplayGuard(),
    registry,
    states,
    new OAuthAccountService(CONFIG, emptyStore()),
  );

  return { controller, provider, states, results };
}

function fakeResponse() {
  const state: {
    cookie: {
      name: string;
      value: string;
      options: Record<string, unknown>;
    } | null;
    cleared: string | null;
    redirected: string | null;
  } = { cookie: null, cleared: null, redirected: null };
  const res = {
    cookie: (name: string, value: string, options: Record<string, unknown>) => {
      state.cookie = { name, value, options };
    },
    clearCookie: (name: string) => {
      state.cleared = name;
    },
    redirect: (_status: number, url: string) => {
      state.redirected = url;
    },
  } as unknown as Response;

  return { res, state };
}

function requestWithCookie(value: string | null): Request {
  return {
    headers: value ? { cookie: `${OAUTH_STATE_COOKIE}=${value}` } : {},
  } as unknown as Request;
}

function reasonOf(promise: Promise<unknown>): Promise<string> {
  return promise.then(
    () => 'accepted',
    (error: unknown) =>
      error instanceof OAuthRefusedException ? error.reason : 'other',
  );
}

describe('OAuthController', () => {
  it('starts a sign-in with a hardened, signed state cookie and a PKCE challenge', () => {
    const { controller } = build();
    const { res, state } = fakeResponse();

    controller.redirect('fake', undefined, res);

    expect(state.cookie?.options).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/oauth',
    });
    expect(state.redirected).toContain('cc=');
    expect(state.redirected).toContain(
      encodeURIComponent('https://app.test/oauth/fake/callback'),
    );
  });

  it('refuses an unknown provider', () => {
    const { controller } = build();

    expect(() =>
      controller.redirect('nope', undefined, fakeResponse().res),
    ).toThrow(OAuthRefusedException);
  });

  it('completes a callback, exchanging the verifier from the cookie', async () => {
    const { controller, provider, results } = build();
    const start = fakeResponse();
    controller.redirect('fake', '/welcome', start.res);
    const stateParam = new URL(start.state.redirected ?? '').searchParams.get(
      'state',
    );

    const callback = fakeResponse();
    await controller.callback(
      'fake',
      'the-code',
      stateParam ?? '',
      undefined,
      requestWithCookie(start.state.cookie?.value ?? null),
      callback.res,
    );

    expect(results[0]).toMatchObject({
      outcome: 'signed-up',
      returnTo: '/welcome',
    });
    expect(provider.exchanges[0]?.code).toBe('the-code');
    expect(provider.exchanges[0]?.codeVerifier).toHaveLength(64);
    expect(callback.state.cleared).toBe(OAUTH_STATE_COOKIE);
  });

  it('drops an off-site returnTo instead of redirecting to it', async () => {
    const { controller, results } = build();
    const start = fakeResponse();
    controller.redirect('fake', 'https://evil.example', start.res);
    const stateParam = new URL(start.state.redirected ?? '').searchParams.get(
      'state',
    );

    await controller.callback(
      'fake',
      'c',
      stateParam ?? '',
      undefined,
      requestWithCookie(start.state.cookie?.value ?? null),
      fakeResponse().res,
    );

    expect(results[0]?.returnTo).toBeNull();
  });

  it('refuses a replayed callback', async () => {
    const { controller } = build();
    const start = fakeResponse();
    controller.redirect('fake', undefined, start.res);
    const stateParam =
      new URL(start.state.redirected ?? '').searchParams.get('state') ?? '';
    const cookie = requestWithCookie(start.state.cookie?.value ?? null);

    await controller.callback(
      'fake',
      'c',
      stateParam,
      undefined,
      cookie,
      fakeResponse().res,
    );

    expect(
      await reasonOf(
        controller.callback(
          'fake',
          'c',
          stateParam,
          undefined,
          cookie,
          fakeResponse().res,
        ),
      ),
    ).toBe('invalid-state');
  });

  it('refuses a callback with no state cookie, as a login CSRF would present', async () => {
    const { controller, provider } = build();

    const reason = await reasonOf(
      controller.callback(
        'fake',
        'c',
        'attacker-state',
        undefined,
        requestWithCookie(null),
        fakeResponse().res,
      ),
    );

    expect(reason).toBe('invalid-state');
    expect(provider.exchanges).toHaveLength(0);
  });

  it('refuses a state that is not the one in the cookie', async () => {
    const { controller, provider } = build();
    const start = fakeResponse();
    controller.redirect('fake', undefined, start.res);

    const reason = await reasonOf(
      controller.callback(
        'fake',
        'c',
        'someone-elses-state',
        undefined,
        requestWithCookie(start.state.cookie?.value ?? null),
        fakeResponse().res,
      ),
    );

    expect(reason).toBe('invalid-state');
    expect(provider.exchanges).toHaveLength(0);
  });

  it('refuses when the provider reports an error, and still clears the cookie', async () => {
    const { controller } = build();
    const callback = fakeResponse();

    const reason = await reasonOf(
      controller.callback(
        'fake',
        undefined,
        undefined,
        'access_denied',
        requestWithCookie(null),
        callback.res,
      ),
    );

    expect(reason).toBe('access-denied');
    expect(callback.state.cleared).toBe(OAUTH_STATE_COOKIE);
  });

  it('binds a link flow to the signed-in user and refuses it when linking is off', () => {
    const { controller } = build();
    const { res, state } = fakeResponse();
    const req = { user: { id: 'user-9' } } as never;

    const response = controller.link('fake', undefined, req, res);

    expect(response.data.url).toContain('https://provider.test/authorize');
    expect(state.cookie?.name).toBe(OAUTH_STATE_COOKIE);

    const refusing = new OAuthController(
      { ...CONFIG, linkPolicy: 'refuse' },
      { handle: () => undefined },
      new MemoryReplayGuard(),
      new OAuthProviderRegistry(CONFIG, () =>
        Promise.reject(new Error('no network')),
      ),
      new OAuthStateService(CONFIG),
      new OAuthAccountService(CONFIG, emptyStore()),
    );

    expect(() =>
      refusing.link('fake', undefined, req, fakeResponse().res),
    ).toThrow(OAuthRefusedException);
  });
});
