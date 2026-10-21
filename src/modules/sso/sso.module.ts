import { DynamicModule, Module, Type } from '@nestjs/common';
import { AuthModule } from '#technical/auth/auth.module';
import { SSO_CONNECTION_STORE } from './sso-connection.store';
import { PrismaSsoConnectionStore } from './prisma-sso-connection.store';
import { SsoConnectionController } from './sso-connection.controller';
import { SsoConnectionService } from './sso-connection.service';
import { SsoDiscoveryService } from './sso-discovery.service';
import {
  SSO_TXT_RESOLVER,
  SsoDomainVerifier,
  systemTxtResolver,
} from './sso-domain-verifier';
import { SSO_FETCH } from './sso-http';
import { SSO_IDENTITY_STORE } from './sso-identity.store';
import { PrismaSsoIdentityStore } from './prisma-sso-identity.store';
import { SessionSsoLoginHandler, SSO_LOGIN_HANDLER } from './sso-login.handler';
import type { SsoLoginHandler } from './sso-login.handler';
import { SsoLoginService } from './sso-login.service';
import { SsoProvisioningService } from './sso-provisioning.service';
import { ssoRedirectUri } from './sso-redirect';
import { SSO_REDIRECT_URI } from './sso.types';
import { SsoRouterService } from './sso-router.service';
import { SsoSecretService } from './sso-secret.service';
import { SsoStateService } from './sso-state.service';
import { SSO_HOST_RESOLVER, systemHostResolver } from './sso-url-guard';
import { SsoController } from './sso.controller';

@Module({
  imports: [AuthModule],
  controllers: [SsoController, SsoConnectionController],
  providers: [
    { provide: SSO_REDIRECT_URI, useFactory: ssoRedirectUri },
    { provide: SSO_FETCH, useValue: fetch },
    { provide: SSO_HOST_RESOLVER, useValue: systemHostResolver },
    { provide: SSO_TXT_RESOLVER, useValue: systemTxtResolver },
    { provide: SSO_CONNECTION_STORE, useClass: PrismaSsoConnectionStore },
    { provide: SSO_IDENTITY_STORE, useClass: PrismaSsoIdentityStore },
    SsoSecretService,
    SsoDiscoveryService,
    SsoDomainVerifier,
    SsoStateService,
    SsoRouterService,
    SsoProvisioningService,
    SsoLoginService,
    SsoConnectionService,
  ],
  exports: [SsoConnectionService, SsoRouterService, SSO_LOGIN_HANDLER],
})
export class SsoModule {
  static forRoot(
    options: { loginHandler?: Type<SsoLoginHandler> } = {},
  ): DynamicModule {
    return {
      module: SsoModule,
      providers: [
        {
          provide: SSO_LOGIN_HANDLER,
          useClass: options.loginHandler ?? SessionSsoLoginHandler,
        },
      ],
    };
  }
}
