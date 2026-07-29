import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { AUTH_PROVIDER } from './auth.types';
import type { AuthenticatedUser, AuthProvider } from './auth.types';
import {
  MissingSessionException,
  InvalidSessionException,
} from '../errors/invalid-session.exception';

export type RequestWithUser = Request & { user: AuthenticatedUser };

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProvider,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.header('authorization');
    const token = header?.startsWith('Bearer ')
      ? header.slice('Bearer '.length)
      : undefined;

    if (!token) {
      throw new MissingSessionException();
    }

    const user = await this.authProvider.validateSession(token);

    if (!user) {
      throw new InvalidSessionException();
    }

    (request as RequestWithUser).user = user;
    return true;
  }
}
