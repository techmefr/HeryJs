import { OAuthRefusedException } from './oauth-refused.exception';
import {
  accessTokenFrom,
  formBody,
  requestJson,
  requestJsonList,
  stringField,
} from './oauth-http';
import type { OAuthFetch } from './oauth-http';
import type {
  OAuthAuthorizationRequest,
  OAuthCodeExchange,
  OAuthProfile,
  OAuthProvider,
  OAuthProviderCredentials,
} from './oauth.types';

const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const USER_URL = 'https://api.github.com/user';
const EMAILS_URL = 'https://api.github.com/user/emails';

export class GithubOAuthProvider implements OAuthProvider {
  readonly name = 'github';

  constructor(
    private readonly credentials: OAuthProviderCredentials,
    private readonly fetchImpl: OAuthFetch,
  ) {}

  authorizationUrl(request: OAuthAuthorizationRequest): string {
    const query = new URLSearchParams({
      client_id: this.credentials.clientId,
      redirect_uri: request.redirectUri,
      scope: 'read:user user:email',
      state: request.state,
      code_challenge: request.codeChallenge,
      code_challenge_method: 'S256',
      allow_signup: 'true',
    });

    return `${AUTHORIZE_URL}?${query.toString()}`;
  }

  async fetchProfile(exchange: OAuthCodeExchange): Promise<OAuthProfile> {
    const token = await requestJson(this.fetchImpl, TOKEN_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: formBody({
        code: exchange.code,
        code_verifier: exchange.codeVerifier,
        redirect_uri: exchange.redirectUri,
        client_id: this.credentials.clientId,
        client_secret: this.credentials.clientSecret,
      }),
    });

    const headers = {
      authorization: `Bearer ${accessTokenFrom(token)}`,
      accept: 'application/vnd.github+json',
    };

    const user = await requestJson(this.fetchImpl, USER_URL, { headers });
    const emails = await requestJsonList(this.fetchImpl, EMAILS_URL, {
      headers,
    });

    const id = user.id;

    if (typeof id !== 'number' && typeof id !== 'string') {
      throw new OAuthRefusedException('provider-failure');
    }

    const verifiedPrimary = emails.find(
      (entry) =>
        entry.primary === true &&
        entry.verified === true &&
        typeof entry.email === 'string',
    );

    return {
      providerUserId: String(id),
      email: verifiedPrimary ? String(verifiedPrimary.email) : null,
      isEmailVerified: verifiedPrimary !== undefined,
      name: stringField(user, 'name') ?? stringField(user, 'login'),
      avatarUrl: stringField(user, 'avatar_url'),
    };
  }
}
