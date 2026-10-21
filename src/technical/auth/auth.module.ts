import { Module } from '@nestjs/common';
import { ApiKeyController } from './api-key.controller';
import { ApiKeyService } from './api-key.service';
import { AuthController } from './auth.controller';
import { BetterAuthController } from './better-auth.controller';
import { AuthRecipientThrottle } from './auth-recipient-throttle';
import { AuthMailerResolver } from './auth-mailer';
import { AuthSmsResolver } from './auth-sms';
import { RateLimitStore } from '#technical/rate-limit/rate-limit-store';
import { AUTH_PROVIDER } from './auth.types';
import { LoginThrottleShutdown } from './login-throttle';
import { PasswordService } from './password.service';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';
import { SessionAuthProvider } from './session-auth.provider';
import { SessionGuard } from './session.guard';

@Module({
  controllers: [
    AuthController,
    ApiKeyController,
    BetterAuthController,
    SessionController,
  ],
  providers: [
    ApiKeyService,
    LoginThrottleShutdown,
    PasswordService,
    SessionService,
    AuthMailerResolver,
    AuthSmsResolver,
    AuthRecipientThrottle,
    RateLimitStore,
    { provide: AUTH_PROVIDER, useClass: SessionAuthProvider },
    SessionGuard,
  ],
  exports: [AUTH_PROVIDER, SessionGuard],
})
export class AuthModule {}
