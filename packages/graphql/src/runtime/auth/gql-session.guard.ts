import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { Request } from 'express';
import {
  AUTH_PROVIDER,
  type AuthenticatedUser,
  type AuthProvider,
  resolveCallerOnce,
} from '@heryjs/core/auth';
import {
  InvalidSessionException,
  MissingSessionException,
} from '@heryjs/core/errors';

export type GqlRequestWithUser = Request & { user: AuthenticatedUser };

@Injectable()
export class GqlSessionGuard implements CanActivate {
  constructor(
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProvider,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = GqlExecutionContext.create(context).getContext<{
      req: Request;
    }>().req;

    const header = request.header('authorization');
    const token = header?.startsWith('Bearer ')
      ? header.slice('Bearer '.length)
      : undefined;

    if (!token) {
      throw new MissingSessionException();
    }

    // Through resolveCallerOnce, never validateSession directly: the tenant
    // middleware has already accepted this bearer token, and an API key it
    // resolved a caller and a tenant for cannot be rejected here without the
    // request running under one identity and none at all. It resolved that
    // caller onto this same request, so this reuses the answer.
    const user = await resolveCallerOnce(this.authProvider, token, request);

    if (!user) {
      throw new InvalidSessionException();
    }

    (request as GqlRequestWithUser).user = user;
    return true;
  }
}
