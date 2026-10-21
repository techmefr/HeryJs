import { SsoDiscoveryService } from './sso-discovery.service';
import type { SsoFetch } from './sso-http';
import { SsoLoginService } from './sso-login.service';
import { SsoProvisioningService } from './sso-provisioning.service';
import { SsoSecretService } from './sso-secret.service';
import { SsoStateService } from './sso-state.service';
import {
  connectionRecord,
  InMemorySsoConnectionStore,
  InMemorySsoIdentityStore,
} from './sso.fakes';

const REDIRECT_URI = 'https://api.test/sso/callback';
const ISSUER = 'https://idp.acme.test';

function idToken(claims: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');

  return `${encode({ alg: 'RS256' })}.${encode(claims)}.signature`;
}

interface Harness {
  service: SsoLoginService;
  states: SsoStateService;
  identities: InMemorySsoIdentityStore;
  requests: Array<{ url: string; body: string }>;
  start: () => { cookieValue: string; state: string; nonce: string };
  claims: (
    overrides?: Record<string, unknown>,
    nonce?: string,
  ) => Record<string, unknown>;
  setTokenResponse: (body: Record<string, unknown>) => void;
}

function build(connection = connectionRecord({ issuer: ISSUER })): Harness {
  const secrets = new SsoSecretService();
  const sealed = {
    ...connection,
    clientSecret: secrets.seal('client-secret', connection.id),
  };
  const connections = new InMemorySsoConnectionStore();
  const identities = new InMemorySsoIdentityStore();
  const states = new SsoStateService();
  const requests: Array<{ url: string; body: string }> = [];
  let tokenResponse: Record<string, unknown> = {};

  connections.rows.push(sealed);

  const fetchImpl: SsoFetch = (url, init) => {
    if (url.endsWith('/.well-known/openid-configuration')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            issuer: ISSUER,
            authorization_endpoint: `${ISSUER}/authorize`,
            token_endpoint: `${ISSUER}/token`,
          }),
        ),
      );
    }

    requests.push({
      url,
      body: typeof init?.body === 'string' ? init.body : '',
    });

    return Promise.resolve(new Response(JSON.stringify(tokenResponse)));
  };
  const discovery = new SsoDiscoveryService(fetchImpl, () =>
    Promise.resolve(['93.184.216.34']),
  );
  const service = new SsoLoginService(
    connections,
    fetchImpl,
    REDIRECT_URI,
    discovery,
    secrets,
    states,
    new SsoProvisioningService(identities),
  );

  return {
    service,
    states,
    identities,
    requests,
    start: () => states.start(connection.id, '/home'),
    claims: (overrides = {}, nonce = 'unused') => ({
      iss: ISSUER,
      aud: connection.clientId,
      sub: 'sub-1',
      email: 'jane@acme.test',
      email_verified: true,
      exp: Math.floor(Date.now() / 1000) + 300,
      nonce,
      ...overrides,
    }),
    setTokenResponse: (body) => {
      tokenResponse = body;
    },
  };
}

describe('SsoLoginService.begin', () => {
  it('builds an authorization request with PKCE, state and nonce', async () => {
    const { service } = build();

    const redirect = await service.begin(
      connectionRecord({ issuer: ISSUER }),
      '/home',
    );
    const url = new URL(redirect.url);

    expect(url.origin + url.pathname).toBe(`${ISSUER}/authorize`);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('client-1');
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT_URI);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('state')).toBeTruthy();
    expect(url.searchParams.get('nonce')).toBeTruthy();
    expect(redirect.cookieValue).toContain('.');
  });
});

describe('SsoLoginService.complete', () => {
  async function run(
    harness: Harness,
    claimOverrides: Record<string, unknown> = {},
    tokenResponse?: Record<string, unknown>,
  ) {
    const started = harness.start();

    harness.setTokenResponse(
      tokenResponse ?? {
        id_token: idToken(harness.claims(claimOverrides, started.nonce)),
      },
    );

    return harness.service.complete({
      code: 'auth-code',
      state: started.state,
      providerError: undefined,
      cookieValue: started.cookieValue,
    });
  }

  it('signs a verified-domain user in and sends the decrypted secret to the token endpoint', async () => {
    const harness = build();

    const result = await run(harness);

    expect(result).toMatchObject({
      outcome: 'signed-up',
      tenantId: 'acme',
      returnTo: '/home',
    });

    const body = new URLSearchParams(harness.requests[0]?.body);

    expect(harness.requests[0]?.url).toBe(`${ISSUER}/token`);
    expect(body.get('client_secret')).toBe('client-secret');
    expect(body.get('code')).toBe('auth-code');
    expect(body.get('code_verifier')).toBeTruthy();
  });

  it.each([
    ['another issuer', { iss: 'https://evil.test' }],
    ['another audience', { aud: 'someone-else' }],
    ['a multi-audience token without azp', { aud: ['client-1', 'other'] }],
    ['an expired token', { exp: Math.floor(Date.now() / 1000) - 3600 }],
    ['a token with no expiry', { exp: undefined }],
    ['another nonce', { nonce: 'replayed' }],
  ])('refuses %s', async (_name, overrides) => {
    await expect(run(build(), overrides)).rejects.toMatchObject({
      reason: 'invalid-state',
    });
  });

  it('accepts a multi-audience token whose azp is this client', async () => {
    await expect(
      run(build(), { aud: ['client-1', 'other'], azp: 'client-1' }),
    ).resolves.toBeTruthy();
  });

  it('refuses a token with no subject', async () => {
    await expect(run(build(), { sub: undefined })).rejects.toMatchObject({
      reason: 'provider-failure',
    });
  });

  it('refuses a token with no email, or an email the IdP says is unverified', async () => {
    await expect(run(build(), { email: undefined })).rejects.toMatchObject({
      reason: 'email-missing',
    });
    await expect(run(build(), { email_verified: false })).rejects.toMatchObject(
      {
        reason: 'email-unverified',
      },
    );
  });

  it('accepts an IdP that omits email_verified, as enterprise IdPs often do', async () => {
    await expect(
      run(build(), { email_verified: undefined }),
    ).resolves.toBeTruthy();
  });

  it('refuses an email outside every verified domain of the connection', async () => {
    await expect(
      run(build(), { email: 'jane@evil.test' }),
    ).rejects.toMatchObject({
      reason: 'email-domain-not-verified',
    });
  });

  it('refuses an email in a domain that is claimed but not yet verified', async () => {
    const connection = connectionRecord({
      issuer: ISSUER,
      domains: [
        {
          id: 'd',
          domain: 'acme.test',
          verificationToken: 't',
          verifiedAt: null,
        },
      ],
    });

    await expect(run(build(connection))).rejects.toMatchObject({
      reason: 'email-domain-not-verified',
    });
  });

  it('refuses a disabled connection and an unknown one', async () => {
    await expect(
      run(build(connectionRecord({ issuer: ISSUER, isEnabled: false }))),
    ).rejects.toMatchObject({
      reason: 'connection-disabled',
    });

    const harness = build();
    const started = harness.states.start('missing', null);

    await expect(
      harness.service.complete({
        code: 'c',
        state: started.state,
        providerError: undefined,
        cookieValue: started.cookieValue,
      }),
    ).rejects.toMatchObject({ reason: 'no-connection' });
  });

  it('refuses a callback without the state cookie or without a code', async () => {
    const harness = build();
    const started = harness.start();

    await expect(
      harness.service.complete({
        code: 'c',
        state: started.state,
        providerError: undefined,
        cookieValue: null,
      }),
    ).rejects.toMatchObject({ reason: 'invalid-state' });
    await expect(
      harness.service.complete({
        code: undefined,
        state: started.state,
        providerError: undefined,
        cookieValue: started.cookieValue,
      }),
    ).rejects.toMatchObject({ reason: 'invalid-state' });
  });

  it('turns an error from the IdP into access-denied', async () => {
    await expect(
      build().service.complete({
        code: undefined,
        state: undefined,
        providerError: 'access_denied',
        cookieValue: null,
      }),
    ).rejects.toMatchObject({ reason: 'access-denied' });
  });

  it('refuses a token response with no id_token', async () => {
    await expect(run(build(), {}, { access_token: 'x' })).rejects.toMatchObject(
      {
        reason: 'provider-failure',
      },
    );
  });
});
