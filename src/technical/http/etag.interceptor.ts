import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { map, Observable } from 'rxjs';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { CACHEABLE_READ_KEY } from './etag.decorator';
import { computeEtag, etagMatches } from './etag';

@Injectable()
export class EtagInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const cacheable = this.reflector.getAllAndOverride<boolean>(
      CACHEABLE_READ_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!cacheable) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const callerKey = resolveCallerKey();
    const ifNoneMatch = request.header('if-none-match');

    return next.handle().pipe(
      map((body: unknown) => {
        const etag = computeEtag(body, callerKey);
        response.setHeader('ETag', etag);
        response.setHeader('Cache-Control', 'private, no-cache');
        response.vary('Authorization');
        response.vary('Cookie');

        if (ifNoneMatch && etagMatches(ifNoneMatch, etag)) {
          response.status(304);
          return undefined;
        }

        return body;
      }),
    );
  }
}

function resolveCallerKey(): string {
  try {
    const tenantId = TenantContextStorage.getTenantId();
    const userId = TenantContextStorage.getUserId();
    const impersonatedBy = TenantContextStorage.getImpersonatedBy();
    return `${tenantId}:${userId ?? ''}:${impersonatedBy ?? ''}`;
  } catch {
    return 'no-tenant-context';
  }
}
