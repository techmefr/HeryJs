import { Inject, Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { AUTH_PROVIDER } from '../auth/auth.types';
import type { AuthProvider } from '../auth/auth.types';
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
    const header = req.header('authorization');
    const token = header?.startsWith('Bearer ')
      ? header.slice('Bearer '.length)
      : undefined;

    const user = token ? await this.authProvider.validateSession(token) : null;
    const tenantId = user?.tenantId ?? 'unauthenticated';

    TenantContextStorage.run({ tenantId }, () => next());
  }
}
