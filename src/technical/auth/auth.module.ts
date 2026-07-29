import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AUTH_PROVIDER } from './auth.types';
import { SessionAuthProvider } from './session-auth.provider';
import { SessionGuard } from './session.guard';

@Module({
  controllers: [AuthController],
  providers: [
    { provide: AUTH_PROVIDER, useClass: SessionAuthProvider },
    SessionGuard,
  ],
  exports: [AUTH_PROVIDER, SessionGuard],
})
export class AuthModule {}
