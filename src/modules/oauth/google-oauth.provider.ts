import { OAuthRefusedException } from './oauth-refused.exception';
import {
  accessTokenFrom,
  audienceMatches,
  decodeIdToken,
  formBody,
  isTruthyClaim,
  requestJson,
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

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export class GoogleOAuthProvider implements OAuthProvider {
  readonly name = 'google';

  constructor(
    private readonly credentials: OAuthProviderCredentials,
    private readonly fetchImpl: OAuthFetch,
  ) {}

  authorizationUrl(request: OAuthAuthorizationRequest): string {
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: this.credentials.clientId,
      redirect_uri: request.redirectUri,
      scope: 'openid email profile',
      state: request.state,
      nonce: request.nonce,
      code_challenge: request.codeChallenge,
      code_challenge_method: 'S256',
    });

    return `${AUTHORIZE_URL}?${query.toString()}`;
  }

  async fetchProfile(exchange: OAuthCodeExchange): Promise<OAuthProfile> {
    const token = await requestJson(this.fetchImpl, TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: formBody({
        grant_type: 'authorization_code',
        code: exchange.code,
        code_verifier: exchange.codeVerifier,
        redirect_uri: exchange.redirectUri,
        client_id: this.credentials.clientId,
        client_secret: this.credentials.clientSecret,
      }),
    });

    accessTokenFrom(token);
    const idToken = stringField(token, 'id_token');

    if (!idToken) {
      throw new OAuthRefusedException('provider-failure');
    }

    const claims = decodeIdToken(idToken);
    const issuer = stringField(claims, 'iss');

    if (
      !issuer ||
      !ISSUERS.includes(issuer) ||
      !audienceMatches(claims, this.credentials.clientId) ||
      claims.nonce !== exchange.nonce
    ) {
      throw new OAuthRefusedException('invalid-state');
    }

    const providerUserId = stringField(claims, 'sub');

    if (!providerUserId) {
      throw new OAuthRefusedException('provider-failure');
    }

    return {
      providerUserId,
      email: stringField(claims, 'email'),
      isEmailVerified: isTruthyClaim(claims.email_verified),
      name: stringField(claims, 'name'),
      avatarUrl: stringField(claims, 'picture'),
    };
  }
}
