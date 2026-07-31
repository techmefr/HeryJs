import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Socket } from 'socket.io';
import { AUTH_PROVIDER } from '#kernel/auth/auth.types';
import type { AuthenticatedUser, AuthProvider } from '#kernel/auth/auth.types';

export type LiveSocket = Omit<Socket, 'data'> & {
  data: { user: AuthenticatedUser };
};

export async function authenticateLiveSocket(
  client: LiveSocket,
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

@Injectable()
export class LiveAuthGuard implements CanActivate {
  constructor(
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProvider,
  ) {}

  canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<LiveSocket>();
    return authenticateLiveSocket(client, this.authProvider);
  }
}
