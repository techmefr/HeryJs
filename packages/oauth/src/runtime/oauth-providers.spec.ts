import { GithubOAuthProvider } from './github-oauth.provider';
import { GoogleOAuthProvider } from './google-oauth.provider';
import { MicrosoftOAuthProvider } from './microsoft-oauth.provider';
import type { OAuthFetch } from './oauth-http';
import { OAuthRefusedException } from './oauth-refused.exception';
import type { OAuthCodeExchange } from './oauth.types';

const CREDENTIALS = { clientId: 'client-id', clientSecret: 'client-secret' };
const EXCHANGE: OAuthCodeExchange = {
  code: 'auth-code',
  codeVerifier: 'verifier',
  nonce: 'nonce-1',
  redirectUri: 'https://app.test/oauth/x/callback',
};

function idToken(claims: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');

  return `${encode({ alg: 'none' })}.${encode(claims)}.signature`;
}

function fakeFetch(routes: Record<string, unknown>): {
  fetchImpl: OAuthFetch;
  calls: { url: string; init: RequestInit | undefined }[];
} {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetchImpl: OAuthFetch = (url, init) => {
    calls.push({ url, init });
    const body = routes[url];

    return Promise.resolve(
      body === undefined
        ? new Response('boom', { status: 500 })
        : new Response(JSON.stringify(body), { status: 200 }),
    );
  };

  return { fetchImpl, calls };
}

function reasonOf(promise: Promise<unknown>): Promise<string> {
  return promise.then(
    () => 'accepted',
    (error: unknown) =>
      error instanceof OAuthRefusedException ? error.reason : 'other',
  );
}

describe('GoogleOAuthProvider', () => {
  const googleClaims = {
    iss: 'https://accounts.google.com',
    aud: 'client-id',
    nonce: 'nonce-1',
    sub: 'g-123',
    email: 'ada@example.com',
    email_verified: true,
    name: 'Ada',
  };

  function provider(claims: Record<string, unknown>) {
    const { fetchImpl, calls } = fakeFetch({
      'https://oauth2.googleapis.com/token': {
        access_token: 'access-secret',
        id_token: idToken(claims),
      },
    });

    return { provider: new GoogleOAuthProvider(CREDENTIALS, fetchImpl), calls };
  }

  it('builds an authorization url with PKCE S256, state and nonce', () => {
    const url = new URL(
      provider(googleClaims).provider.authorizationUrl({
        state: 's',
        nonce: 'n',
        codeChallenge: 'c',
        redirectUri: 'https://app.test/oauth/google/callback',
      }),
    );

    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBe('s');
    expect(url.searchParams.get('nonce')).toBe('n');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://app.test/oauth/google/callback',
    );
  });

  it('reads the profile and sends the PKCE verifier', async () => {
    const { provider: google, calls } = provider(googleClaims);

    const profile = await google.fetchProfile(EXCHANGE);

    expect(profile).toMatchObject({
      providerUserId: 'g-123',
      email: 'ada@example.com',
      isEmailVerified: true,
    });
    expect(calls[0]?.init?.body as string).toContain('code_verifier=verifier');
  });

  it('treats a string "false" email_verified as unverified', async () => {
    const { provider: google } = provider({
      ...googleClaims,
      email_verified: 'false',
    });

    expect((await google.fetchProfile(EXCHANGE)).isEmailVerified).toBe(false);
  });

  it.each([
    ['nonce', { nonce: 'replayed' }],
    ['audience', { aud: 'other-client' }],
    ['issuer', { iss: 'https://evil.example' }],
  ])('refuses a mismatched %s', async (_label, override) => {
    const { provider: google } = provider({ ...googleClaims, ...override });

    expect(await reasonOf(google.fetchProfile(EXCHANGE))).toBe('invalid-state');
  });

  it('reports a failing token endpoint without echoing its body', async () => {
    const { fetchImpl } = fakeFetch({});
    const google = new GoogleOAuthProvider(CREDENTIALS, fetchImpl);

    const error = await google
      .fetchProfile(EXCHANGE)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(OAuthRefusedException);
    expect(String((error as Error).message)).not.toContain('boom');
  });
});

describe('GithubOAuthProvider', () => {
  function provider(emails: unknown[]) {
    const { fetchImpl, calls } = fakeFetch({
      'https://github.com/login/oauth/access_token': {
        access_token: 'gh-secret',
      },
      'https://api.github.com/user': {
        id: 42,
        login: 'ada',
        name: null,
        email: 'public-unverified@example.com',
      },
      'https://api.github.com/user/emails': emails,
    });

    return { provider: new GithubOAuthProvider(CREDENTIALS, fetchImpl), calls };
  }

  it('uses the primary verified email, never the public profile email', async () => {
    const { provider: github } = provider([
      { email: 'other@example.com', primary: false, verified: true },
      { email: 'ada@example.com', primary: true, verified: true },
    ]);

    const profile = await github.fetchProfile(EXCHANGE);

    expect(profile).toMatchObject({
      providerUserId: '42',
      email: 'ada@example.com',
      isEmailVerified: true,
      name: 'ada',
    });
  });

  it('reports no email when the primary one is unverified', async () => {
    const { provider: github } = provider([
      { email: 'ada@example.com', primary: true, verified: false },
    ]);

    const profile = await github.fetchProfile(EXCHANGE);

    expect(profile.email).toBeNull();
    expect(profile.isEmailVerified).toBe(false);
  });

  it('sends the access token only as a bearer header', async () => {
    const { provider: github, calls } = provider([]);

    await github.fetchProfile(EXCHANGE);

    const userCall = calls.find(
      (call) => call.url === 'https://api.github.com/user',
    );

    expect(userCall?.url).not.toContain('gh-secret');
    const headers = (userCall?.init?.headers ?? {}) as Record<string, string>;

    expect(headers.authorization).toBe('Bearer gh-secret');
  });
});

describe('MicrosoftOAuthProvider', () => {
  const claims = {
    iss: 'https://login.microsoftonline.com/tenant-1/v2.0',
    aud: 'client-id',
    nonce: 'nonce-1',
    sub: 'ms-1',
    email: 'ada@corp.example',
    name: 'Ada',
  };

  function provider(tokenClaims: Record<string, unknown>, tenant = 'common') {
    const { fetchImpl } = fakeFetch({
      [`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`]: {
        access_token: 'ms-secret',
        id_token: idToken(tokenClaims),
      },
    });

    return new MicrosoftOAuthProvider(CREDENTIALS, tenant, fetchImpl);
  }

  it('never trusts the email claim without the domain-owner-verified claim', async () => {
    const profile = await provider(claims).fetchProfile(EXCHANGE);

    expect(profile.email).toBe('ada@corp.example');
    expect(profile.isEmailVerified).toBe(false);
  });

  it('trusts the email once xms_edov asserts it', async () => {
    const profile = await provider({ ...claims, xms_edov: true }).fetchProfile(
      EXCHANGE,
    );

    expect(profile.isEmailVerified).toBe(true);
  });

  it('pins the issuer when a single tenant is configured', async () => {
    const pinned = provider(
      { ...claims, iss: 'https://login.microsoftonline.com/other/v2.0' },
      'tenant-1',
    );

    expect(await reasonOf(pinned.fetchProfile(EXCHANGE))).toBe('invalid-state');
  });

  it('refuses a replayed nonce', async () => {
    expect(
      await reasonOf(
        provider({ ...claims, nonce: 'old' }).fetchProfile(EXCHANGE),
      ),
    ).toBe('invalid-state');
  });
});
