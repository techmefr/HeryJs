import { Module } from '@nestjs/common';
import { ApiKeyController } from './api-key.controller';
import { ApiKeyService } from './api-key.service';
import { AuthController } from './auth.controller';
import { BetterAuthController } from './better-auth.controller';
import { AuthMailerResolver } from './auth-mailer';
import { AUTH_PROVIDER } from './auth.types';
import { SessionAuthProvider } from './session-auth.provider';
import { SessionGuard } from './session.guard';

@Module({
  controllers: [AuthController, ApiKeyController, BetterAuthController],
  providers: [
    ApiKeyService,
    AuthMailerResolver,
    { provide: AUTH_PROVIDER, useClass: SessionAuthProvider },
    SessionGuard,
  ],
  exports: [AUTH_PROVIDER, SessionGuard],
})
export class AuthModule {}
