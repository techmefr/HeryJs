import { Inject, Injectable } from '@nestjs/common';
import { SsoRefusedException } from './sso-refused.exception';
import { requestJson, SSO_FETCH, stringField } from './sso-http';
import type { SsoFetch } from './sso-http';
import { assertPublicHttpsUrl, SSO_HOST_RESOLVER } from './sso-url-guard';
import type { SsoHostResolver } from './sso-url-guard';
import { ssoEnv } from './sso.env';
import type { SsoDiscoveryDocument } from './sso.types';

const DISCOVERY_PATH = '/.well-known/openid-configuration';

export function discoveryUrlFor(issuer: string): string {
  return `${issuer.replace(/\/+$/, '')}${DISCOVERY_PATH}`;
}

@Injectable()
export class SsoDiscoveryService {
  constructor(
    @Inject(SSO_FETCH) private readonly fetchImpl: SsoFetch,
    @Inject(SSO_HOST_RESOLVER) private readonly resolve: SsoHostResolver,
  ) {}

  async assertIssuerReachable(issuer: string): Promise<void> {
    await this.guarded(issuer);
  }

  async discover(issuer: string): Promise<SsoDiscoveryDocument> {
    const url = await this.guarded(discoveryUrlFor(issuer));
    const document = await requestJson(this.fetchImpl, url.toString(), {
      method: 'GET',
      headers: { accept: 'application/json' },
    });

    if (stringField(document, 'issuer') !== issuer) {
      throw new SsoRefusedException('untrusted-issuer');
    }

    const authorizationEndpoint = stringField(
      document,
      'authorization_endpoint',
    );
    const tokenEndpoint = stringField(document, 'token_endpoint');

    if (!authorizationEndpoint || !tokenEndpoint) {
      throw new SsoRefusedException('provider-failure');
    }

    await this.guarded(authorizationEndpoint);
    await this.guarded(tokenEndpoint);

    return { issuer, authorizationEndpoint, tokenEndpoint };
  }

  private guarded(value: string): Promise<URL> {
    return assertPublicHttpsUrl(
      value,
      this.resolve,
      ssoEnv.SSO_ALLOW_PRIVATE_ISSUERS,
    );
  }
}
