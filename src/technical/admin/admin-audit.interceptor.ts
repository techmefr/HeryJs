import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import { writeAuditLog } from '#technical/audit/audit-log';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import type { RequestWithUser } from '#technical/auth/session.guard';
import { ADMIN_ACTION } from './admin-keys';
import type { AdminActionOptions } from './admin-types';

/**
 * Records that an operator triggered an admin action, before it runs. Written
 * first and not after: an action that crashes halfway is the one the trail
 * most needs, and a failed audit write stops the request, because an
 * unaudited admin action is the thing this exists to prevent.
 *
 * The entry keeps the names of the fields that were sent, never their values:
 * a form can carry a password or a token, and the chain is meant to be shown.
 */
@Injectable()
export class AdminAuditInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const action = this.reflector.get<AdminActionOptions | undefined>(
      ADMIN_ACTION,
      context.getHandler(),
    );
    const request = context
      .switchToHttp()
      .getRequest<Request & Partial<Pick<RequestWithUser, 'user'>>>();

    if (action && request.user) {
      const body: unknown = request.body;

      await writeAuditLog(authPrismaClient, {
        tenantId: request.user.tenantId,
        model: 'AdminAction',
        operation: action.id,
        recordId: String(request.params.id ?? '') || null,
        data: {
          method: request.method,
          path: request.path,
          fields:
            typeof body === 'object' && body !== null
              ? Object.keys(body).sort()
              : [],
        },
        userId: request.user.id,
        impersonatedBy: request.user.impersonatedBy,
      });
    }

    return next.handle();
  }
}
