import { Inject, Injectable } from '@nestjs/common';
import { SsoRefusedException } from './sso-refused.exception';
import { requestJson, requestText, SSO_FETCH, stringField } from './sso-http';
import type { SsoFetch } from './sso-http';
import { assertPublicHttpsUrl, SSO_HOST_RESOLVER } from './sso-url-guard';
import type { SsoHostResolver } from './sso-url-guard';
import { ssoEnv } from './sso.env';
import type { SsoDiscoveryDocument } from './sso.types';

const PROBE_TIMEOUT_MS = 5000;
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

  /** The body of a document an administrator pointed at, under the same URL rules as discovery. */
  async fetchDocument(url: string): Promise<string> {
    const guarded = await this.guarded(url);

    return requestText(this.fetchImpl, guarded.toString());
  }

  /** Whether the URL answers at all: any HTTP status below 500 counts, a refusal or a timeout does not. */
  async isReachable(url: string): Promise<boolean> {
    try {
      const guarded = await this.guarded(url);
      const response = await this.fetchImpl(guarded.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });

      return response.status < 500;
    } catch {
      return false;
    }
  }

  private guarded(value: string): Promise<URL> {
    return assertPublicHttpsUrl(
      value,
      this.resolve,
      ssoEnv.SSO_ALLOW_PRIVATE_ISSUERS,
    );
  }
}
