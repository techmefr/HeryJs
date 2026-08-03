import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { AUTH_PROVIDER } from './auth.types';
import type { AuthenticatedUser, AuthProvider } from './auth.types';
import { resolveCaller } from './resolve-caller';
import {
  MissingSessionException,
  InvalidSessionException,
} from '#technical/errors/invalid-session.exception';
import { TraceContextStorage } from '#technical/tracing/trace-context';

export type RequestWithUser = Request & { user: AuthenticatedUser };

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProvider,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const start = process.hrtime.bigint();
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.header('authorization');
    const token = header?.startsWith('Bearer ')
      ? header.slice('Bearer '.length)
      : undefined;

    const durationMs = () =>
      Number(process.hrtime.bigint() - start) / 1_000_000;

    if (!token) {
      TraceContextStorage.pushStep({
        stage: 'guard',
        label: 'session',
        status: 'blocked',
        durationMs: durationMs(),
        detail: { reason: 'missing session' },
      });
      throw new MissingSessionException();
    }

    const user = await resolveCaller(this.authProvider, token);

    if (!user) {
      TraceContextStorage.pushStep({
        stage: 'guard',
        label: 'session',
        status: 'blocked',
        durationMs: durationMs(),
        detail: { reason: 'invalid session' },
      });
      throw new InvalidSessionException();
    }

    (request as RequestWithUser).user = user;

    TraceContextStorage.pushStep({
      stage: 'guard',
      label: 'session',
      status: 'ok',
      durationMs: durationMs(),
      detail: { userId: user.id },
    });

    return true;
  }
}
