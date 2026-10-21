import type { ExecutionContext } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, of } from 'rxjs';
import { IdempotencyKeyMismatchException } from '#technical/errors/idempotency-key-mismatch.exception';
import type { IdempotencyRecord } from './idempotency-key.store';

const HTTP_CODE_METADATA = '__httpCode__';

export function assertSameRequest(
  existing: IdempotencyRecord,
  route: string,
  bodyHash: string,
  key: string,
): void {
  if (existing.route !== route || existing.bodyHash !== bodyHash) {
    throw new IdempotencyKeyMismatchException(key);
  }
}

export function replay(
  existing: IdempotencyRecord,
  response: Response,
): Observable<unknown> {
  const headers = (existing.responseHeaders ?? {}) as Record<string, string>;

  for (const [name, value] of Object.entries(headers)) {
    response.setHeader(name, value);
  }

  if (existing.statusCode) {
    response.status(existing.statusCode);
  }

  return of(existing.responseBody);
}

export function declaredStatusCode(context: ExecutionContext): number {
  const explicit = Reflect.getMetadata(
    HTTP_CODE_METADATA,
    context.getHandler(),
  ) as number | undefined;

  if (explicit) {
    return explicit;
  }

  const request = context.switchToHttp().getRequest<Request>();
  return request.method === 'POST' ? 201 : 200;
}
