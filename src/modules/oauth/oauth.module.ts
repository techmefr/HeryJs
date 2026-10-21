import { DynamicModule, Module, Type } from '@nestjs/common';
import { AuthModule } from '#technical/auth/auth.module';
import { env } from '#technical/config/env';
import { PrismaModule } from '#technical/prisma/prisma.module';
import { OAuthAccountService } from './oauth-account.service';
import { OAUTH_FETCH } from './oauth-http';
import {
  OAUTH_IDENTITY_STORE,
  PrismaOAuthIdentityStore,
} from './oauth-identity.store';
import {
  JsonOAuthLoginHandler,
  OAUTH_LOGIN_HANDLER,
} from './oauth-login.handler';
import type { OAuthLoginHandler } from './oauth-login.handler';
import { OAuthProviderRegistry } from './oauth-provider.registry';
import {
  OAUTH_REPLAY_GUARD,
  ValkeyOAuthReplayGuard,
} from './oauth-replay.guard';
import { OAuthStateService } from './oauth-state.service';
import { OAuthController } from './oauth.controller';
import { OAUTH_CONFIG } from './oauth.types';
import type { OAuthConfig, OAuthProviderCredentials } from './oauth.types';

const DEV_FALLBACK_BASE_URL = `http://localhost:${env.PORT}`;

function credentialsFrom(
  clientId: string | undefined,
  clientSecret: string | undefined,
): OAuthProviderCredentials | null {
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

function configFromEnv(): OAuthConfig {
  const pairs = {
    google: credentialsFrom(
      env.OAUTH_GOOGLE_CLIENT_ID,
      env.OAUTH_GOOGLE_CLIENT_SECRET,
    ),
    github: credentialsFrom(
      env.OAUTH_GITHUB_CLIENT_ID,
      env.OAUTH_GITHUB_CLIENT_SECRET,
    ),
    microsoft: credentialsFrom(
      env.OAUTH_MICROSOFT_CLIENT_ID,
      env.OAUTH_MICROSOFT_CLIENT_SECRET,
    ),
  };
  const credentials: OAuthConfig['credentials'] = {};

  for (const [name, pair] of Object.entries(pairs)) {
    if (pair) {
      credentials[name] = pair;
    }
  }

  const isProduction = process.env.NODE_ENV === 'production';

  return {
    linkPolicy: env.OAUTH_LINK_POLICY,
    isSignUpAllowed: env.OAUTH_ALLOW_SIGN_UP,
    redirectBaseUrl:
      env.OAUTH_REDIRECT_BASE_URL ??
      (isProduction ? null : DEV_FALLBACK_BASE_URL),
    stateSecret: env.OAUTH_STATE_SECRET,
    isProduction,
    credentials,
    microsoftTenant: env.OAUTH_MICROSOFT_TENANT,
  };
}

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [OAuthController],
  providers: [
    { provide: OAUTH_CONFIG, useFactory: configFromEnv },
    { provide: OAUTH_FETCH, useValue: fetch },
    { provide: OAUTH_IDENTITY_STORE, useClass: PrismaOAuthIdentityStore },
    { provide: OAUTH_REPLAY_GUARD, useClass: ValkeyOAuthReplayGuard },
    OAuthProviderRegistry,
    OAuthStateService,
    OAuthAccountService,
  ],
  exports: [OAuthAccountService, OAuthProviderRegistry, OAUTH_LOGIN_HANDLER],
})
export class OAuthModule {
  static forRoot(
    options: { loginHandler?: Type<OAuthLoginHandler> } = {},
  ): DynamicModule {
    return {
      module: OAuthModule,
      providers: [
        {
          provide: OAUTH_LOGIN_HANDLER,
          useClass: options.loginHandler ?? JsonOAuthLoginHandler,
        },
      ],
    };
  }
}
