import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Socket } from 'socket.io';
import { AUTH_PROVIDER } from '#technical/auth/auth.types';
import type { AuthenticatedUser, AuthProvider } from '#technical/auth/auth.types';

export type AuthenticatedSocket = Omit<Socket, 'data'> & {
  data: { user: AuthenticatedUser };
};

export async function authenticateSocket(
  client: AuthenticatedSocket,
  authProvider: AuthProvider,
): Promise<boolean> {
  if (client.data.user) {
    return true;
  }

  const token = client.handshake.auth?.token as string | undefined;
  if (!token) {
    return false;
  }

  const user = await authProvider.validateSession(token);
  if (!user) {
    return false;
  }

  client.data.user = user;
  return true;
}

/**
 * Kernel-shared because it has no gateway-specific logic in it: it resolves
 * a session the same way for any WebSocket gateway a module registers. Two
 * modules signalling over the same auth path (`live`, `peer`) is the whole
 * point -- duplicating this per module is the second auth path that loses
 * the tenant boundary.
 */
@Injectable()
export class SocketAuthGuard implements CanActivate {
  constructor(
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProvider,
  ) {}

  canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<AuthenticatedSocket>();
    return authenticateSocket(client, this.authProvider);
  }
}
