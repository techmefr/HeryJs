import { Inject, Injectable } from '@nestjs/common';
import { GithubOAuthProvider } from './github-oauth.provider';
import { GoogleOAuthProvider } from './google-oauth.provider';
import { MicrosoftOAuthProvider } from './microsoft-oauth.provider';
import { OAUTH_FETCH } from './oauth-http';
import type { OAuthFetch } from './oauth-http';
import { OAuthRefusedException } from './oauth-refused.exception';
import { OAUTH_CONFIG } from './oauth.types';
import type { OAuthConfig, OAuthProvider } from './oauth.types';

const TENANT_PATTERN = /^[A-Za-z0-9.-]+$/;

@Injectable()
export class OAuthProviderRegistry {
  private readonly providers = new Map<string, OAuthProvider>();

  constructor(
    @Inject(OAUTH_CONFIG) config: OAuthConfig,
    @Inject(OAUTH_FETCH) fetchImpl: OAuthFetch,
  ) {
    const { credentials } = config;

    if (credentials.google) {
      this.register(new GoogleOAuthProvider(credentials.google, fetchImpl));
    }

    if (credentials.github) {
      this.register(new GithubOAuthProvider(credentials.github, fetchImpl));
    }

    if (credentials.microsoft) {
      if (!TENANT_PATTERN.test(config.microsoftTenant)) {
        throw new Error('OAUTH_MICROSOFT_TENANT contains invalid characters');
      }

      this.register(
        new MicrosoftOAuthProvider(
          credentials.microsoft,
          config.microsoftTenant,
          fetchImpl,
        ),
      );
    }
  }

  register(provider: OAuthProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: string): OAuthProvider {
    const provider = this.providers.get(name);

    if (!provider) {
      throw new OAuthRefusedException('unknown-provider');
    }

    return provider;
  }

  names(): string[] {
    return [...this.providers.keys()];
  }
}
