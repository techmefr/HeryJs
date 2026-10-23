export { AUTH_MAILER } from '../auth/auth-mailer';
export type { AuthMailer } from '../auth/auth-mailer';
export { AUTH_SMS_SENDER } from '../auth/auth-sms';
export type { AuthSmsSender } from '../auth/auth-sms';
export { AuthModule } from '../auth/auth.module';
export { AUTH_PROVIDER } from '../auth/auth.types';
export type { AuthProvider, AuthenticatedUser } from '../auth/auth.types';
export { authPrismaClient, getAuthContext } from '../auth/better-auth.instance';
export { resolveCallerOnce } from '../auth/resolve-caller';
export { SessionGuard } from '../auth/session.guard';
export type { RequestWithUser } from '../auth/session.guard';
export {
  SocketAuthGuard,
  authenticateSocket,
} from '../websocket/socket-auth.guard';
export type { AuthenticatedSocket } from '../websocket/socket-auth.guard';
