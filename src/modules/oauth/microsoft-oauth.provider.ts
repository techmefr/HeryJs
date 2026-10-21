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

const LOGIN_HOST = 'https://login.microsoftonline.com';
const MULTI_TENANT_ALIASES = ['common', 'organizations', 'consumers'];

export class MicrosoftOAuthProvider implements OAuthProvider {
  readonly name = 'microsoft';

  constructor(
    private readonly credentials: OAuthProviderCredentials,
    private readonly tenant: string,
    private readonly fetchImpl: OAuthFetch,
  ) {}

  authorizationUrl(request: OAuthAuthorizationRequest): string {
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: this.credentials.clientId,
      redirect_uri: request.redirectUri,
      response_mode: 'query',
      scope: 'openid email profile',
      state: request.state,
      nonce: request.nonce,
      code_challenge: request.codeChallenge,
      code_challenge_method: 'S256',
    });

    return `${LOGIN_HOST}/${this.tenant}/oauth2/v2.0/authorize?${query.toString()}`;
  }

  async fetchProfile(exchange: OAuthCodeExchange): Promise<OAuthProfile> {
    const token = await requestJson(
      this.fetchImpl,
      `${LOGIN_HOST}/${this.tenant}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: formBody({
          grant_type: 'authorization_code',
          code: exchange.code,
          code_verifier: exchange.codeVerifier,
          redirect_uri: exchange.redirectUri,
          client_id: this.credentials.clientId,
          client_secret: this.credentials.clientSecret,
          scope: 'openid email profile',
        }),
      },
    );

    accessTokenFrom(token);
    const idToken = stringField(token, 'id_token');

    if (!idToken) {
      throw new OAuthRefusedException('provider-failure');
    }

    const claims = decodeIdToken(idToken);

    if (
      !audienceMatches(claims, this.credentials.clientId) ||
      claims.nonce !== exchange.nonce ||
      !this.isIssuerExpected(claims)
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
      isEmailVerified: isTruthyClaim(claims.xms_edov),
      name: stringField(claims, 'name'),
      avatarUrl: null,
    };
  }

  private isIssuerExpected(claims: Record<string, unknown>): boolean {
    const issuer = stringField(claims, 'iss');

    if (!issuer) {
      return false;
    }

    if (MULTI_TENANT_ALIASES.includes(this.tenant)) {
      return issuer.startsWith(`${LOGIN_HOST}/`);
    }

    return issuer === `${LOGIN_HOST}/${this.tenant}/v2.0`;
  }
}
