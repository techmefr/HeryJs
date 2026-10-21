import { Inject, Injectable } from '@nestjs/common';
import { SSO_CONNECTION_STORE } from './sso-connection.store';
import type { SsoConnectionStore } from './sso-connection.store';
import { SsoDiscoveryService } from './sso-discovery.service';
import { domainOfEmail } from './sso-domain';
import { decodeIdToken, requestJson, SSO_FETCH, stringField } from './sso-http';
import type { SsoFetch } from './sso-http';
import { SsoProvisioningService } from './sso-provisioning.service';
import { SsoRefusedException } from './sso-refused.exception';
import { sanitizeReturnTo } from './sso-return-to';
import { SsoSecretService } from './sso-secret.service';
import { SsoStateService } from './sso-state.service';
import type { SsoStatePayload } from './sso-state.service';
import { SSO_REDIRECT_URI } from './sso.types';
import type {
  SsoConnectionRecord,
  SsoLoginResult,
  SsoProfile,
} from './sso.types';

const CLOCK_SKEW_SECONDS = 60;
const SCOPE = 'openid email profile';

export interface SsoRedirect {
  url: string;
  cookieValue: string;
}

export interface SsoCallbackInput {
  code: string | undefined;
  state: string | undefined;
  providerError: string | undefined;
  cookieValue: string | null;
}

function audienceMatches(
  claims: Record<string, unknown>,
  clientId: string,
): boolean {
  const audience = claims.aud;

  if (Array.isArray(audience)) {
    return (
      audience.includes(clientId) &&
      (audience.length === 1 || claims.azp === clientId)
    );
  }

  return audience === clientId;
}

@Injectable()
export class SsoLoginService {
  constructor(
    @Inject(SSO_CONNECTION_STORE)
    private readonly connections: SsoConnectionStore,
    @Inject(SSO_FETCH) private readonly fetchImpl: SsoFetch,
    @Inject(SSO_REDIRECT_URI) private readonly redirectUri: string,
    private readonly discovery: SsoDiscoveryService,
    private readonly secrets: SsoSecretService,
    private readonly states: SsoStateService,
    private readonly provisioning: SsoProvisioningService,
  ) {}

  async begin(
    connection: SsoConnectionRecord,
    returnTo: string | undefined,
  ): Promise<SsoRedirect> {
    const document = await this.discovery.discover(connection.issuer);
    const started = this.states.start(
      connection.id,
      sanitizeReturnTo(returnTo),
    );
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: connection.clientId,
      redirect_uri: this.redirectUri,
      scope: SCOPE,
      state: started.state,
      nonce: started.nonce,
      code_challenge: started.codeChallenge,
      code_challenge_method: 'S256',
    });
    const separator = document.authorizationEndpoint.includes('?') ? '&' : '?';

    return {
      url: `${document.authorizationEndpoint}${separator}${query.toString()}`,
      cookieValue: started.cookieValue,
    };
  }

  async complete(input: SsoCallbackInput): Promise<SsoLoginResult> {
    if (input.providerError) {
      throw new SsoRefusedException('access-denied');
    }

    const payload = this.states.verify(input.cookieValue, input.state ?? null);

    if (!input.code) {
      throw new SsoRefusedException('invalid-state');
    }

    const connection = await this.connections.findById(payload.connectionId);

    if (!connection) {
      throw new SsoRefusedException('no-connection');
    }

    if (!connection.isEnabled) {
      throw new SsoRefusedException('connection-disabled');
    }

    const profile = await this.exchange(connection, payload, input.code);

    return this.provisioning.resolve(
      connection,
      profile,
      sanitizeReturnTo(payload.returnTo ?? undefined),
    );
  }

  private async exchange(
    connection: SsoConnectionRecord,
    payload: SsoStatePayload,
    code: string,
  ): Promise<SsoProfile> {
    const document = await this.discovery.discover(connection.issuer);
    const token = await requestJson(this.fetchImpl, document.tokenEndpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        code_verifier: payload.codeVerifier,
        redirect_uri: this.redirectUri,
        client_id: connection.clientId,
        client_secret: this.secrets.open(
          connection.clientSecret,
          connection.id,
        ),
      }).toString(),
    });
    const idToken = stringField(token, 'id_token');

    if (!idToken) {
      throw new SsoRefusedException('provider-failure');
    }

    return this.profileFrom(connection, decodeIdToken(idToken), payload.nonce);
  }

  private profileFrom(
    connection: SsoConnectionRecord,
    claims: Record<string, unknown>,
    nonce: string,
  ): SsoProfile {
    const expiry = typeof claims.exp === 'number' ? claims.exp : 0;
    const isExpired = expiry + CLOCK_SKEW_SECONDS < Date.now() / 1000;

    if (
      claims.iss !== connection.issuer ||
      !audienceMatches(claims, connection.clientId) ||
      claims.nonce !== nonce ||
      isExpired
    ) {
      throw new SsoRefusedException('invalid-state');
    }

    const subject = stringField(claims, 'sub');

    if (!subject) {
      throw new SsoRefusedException('provider-failure');
    }

    const email = stringField(claims, 'email');

    if (!email) {
      throw new SsoRefusedException('email-missing');
    }

    if (claims.email_verified === false || claims.email_verified === 'false') {
      throw new SsoRefusedException('email-unverified');
    }

    this.assertVerifiedDomain(connection, email);

    return {
      subject,
      email: email.toLowerCase(),
      name: stringField(claims, 'name'),
      avatarUrl: stringField(claims, 'picture'),
    };
  }

  private assertVerifiedDomain(
    connection: SsoConnectionRecord,
    email: string,
  ): void {
    const domain = domainOfEmail(email);
    const isVerified = connection.domains.some(
      (entry) => entry.verifiedAt !== null && entry.domain === domain,
    );

    if (!isVerified) {
      throw new SsoRefusedException('email-domain-not-verified');
    }
  }
}
