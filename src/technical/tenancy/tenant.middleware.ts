import { Inject, Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { AUTH_PROVIDER } from '#technical/auth/auth.types';
import type { AuthProvider } from '#technical/auth/auth.types';
import { resolveCallerOnce } from '#technical/auth/resolve-caller';
import { TraceContextStorage } from '#technical/tracing/trace-context';
import { TenantContextStorage } from './tenant-context';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProvider,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // The tenant must never be trusted from client input (a header, a query
    // param): it is always derived from the authenticated session, so a
    // caller cannot simply ask to see another tenant's data. Middleware
    // (rather than a guard or interceptor) is what lets this ambient
    // AsyncLocalStorage context wrap every downstream guard, interceptor,
    // and handler for the request, including tenant-scoped Prisma calls
    // made while resolving capabilities.
    const start = process.hrtime.bigint();
    const header = req.header('authorization');
    const token = header?.startsWith('Bearer ')
      ? header.slice('Bearer '.length)
      : undefined;

    const user = token
      ? await resolveCallerOnce(this.authProvider, token, req)
      : null;
    const tenantId = user?.tenantId ?? 'unauthenticated';

    TraceContextStorage.pushStep({
      stage: 'middleware',
      label: 'tenant resolution',
      status: 'ok',
      durationMs: Number(process.hrtime.bigint() - start) / 1_000_000,
      detail: { tenantId },
    });

    TenantContextStorage.run(
      {
        tenantId,
        userId: user?.id ?? null,
        impersonatedBy: user?.impersonatedBy ?? null,
      },
      () => next(),
    );
  }
}
