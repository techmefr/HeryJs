import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { lastValueFrom, Observable, of } from 'rxjs';
import { IdempotencyLockTimeoutException } from '#technical/errors/idempotency-lock-timeout.exception';
import { LockService } from '#technical/lock/lock.service';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { IdempotencyKeyStore } from './idempotency-key.store';
import type { IdempotencyRecord } from './idempotency-key.store';
import {
  assertSameRequest,
  declaredStatusCode,
  replay,
} from './idempotency-replay';
import {
  capturedHeaders,
  hashBody,
  isExpired,
  routeOf,
  sleep,
} from './idempotency.util';

const IDEMPOTENCY_HEADER = 'idempotency-key';
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const MAX_KEY_LENGTH = 255;
const LOCK_TTL_MS = 30_000;
const LOCK_WAIT_TIMEOUT_MS = 10_000;
const LOCK_POLL_INTERVAL_MS = 50;

interface IdempotentRequest {
  tenantId: string;
  key: string;
  route: string;
  bodyHash: string;
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly store: IdempotencyKeyStore,
    private readonly lockService: LockService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const key = request.header(IDEMPOTENCY_HEADER);
    const tenantId = TenantContextStorage.findTenantId();

    if (
      !MUTATING_METHODS.has(request.method) ||
      !key ||
      key.length > MAX_KEY_LENGTH ||
      tenantId === null
    ) {
      return next.handle();
    }

    const response = context.switchToHttp().getResponse<Response>();
    const idempotent: IdempotentRequest = {
      tenantId,
      key,
      route: routeOf(request),
      bodyHash: hashBody(request.body),
    };

    return this.runWhenOwningKey(context, next, response, idempotent);
  }

  private async runWhenOwningKey(
    context: ExecutionContext,
    next: CallHandler,
    response: Response,
    idempotent: IdempotentRequest,
  ): Promise<Observable<unknown>> {
    const lockName = `idempotency:${idempotent.tenantId}:${idempotent.key}`;
    const deadline = Date.now() + LOCK_WAIT_TIMEOUT_MS;

    for (;;) {
      const lock = await this.lockService.acquire(lockName, {
        ttlMs: LOCK_TTL_MS,
      });

      if (lock) {
        try {
          return await this.runUnderLock(context, next, response, idempotent);
        } finally {
          await lock.release();
        }
      }

      const existing = await this.liveRecord(idempotent);

      if (existing) {
        assertSameRequest(
          existing,
          idempotent.route,
          idempotent.bodyHash,
          idempotent.key,
        );

        if (existing.status === 'completed') {
          return replay(existing, response);
        }
      }

      if (Date.now() >= deadline) {
        throw new IdempotencyLockTimeoutException(idempotent.key);
      }

      await sleep(LOCK_POLL_INTERVAL_MS);
    }
  }

  private async liveRecord(
    idempotent: IdempotentRequest,
  ): Promise<IdempotencyRecord | null> {
    const record = await this.store.findRecord(
      idempotent.tenantId,
      idempotent.key,
    );

    if (record && isExpired(record.createdAt)) {
      return null;
    }

    return record;
  }

  private async runUnderLock(
    context: ExecutionContext,
    next: CallHandler,
    response: Response,
    idempotent: IdempotentRequest,
  ): Promise<Observable<unknown>> {
    const { tenantId, key, route, bodyHash } = idempotent;
    const existing = await this.liveRecord(idempotent);

    if (existing) {
      assertSameRequest(existing, route, bodyHash, key);

      if (existing.status === 'completed') {
        return replay(existing, response);
      }
    } else {
      await this.store.discard(tenantId, key);
      await this.store.createPending(tenantId, key, route, bodyHash);
    }

    try {
      const body: unknown = await lastValueFrom(next.handle());
      const statusCode = declaredStatusCode(context);
      const headers = capturedHeaders(response);

      await this.store.complete(tenantId, key, statusCode, body, headers);

      response.status(statusCode);
      return of(body);
    } catch (error) {
      await this.store.discard(tenantId, key);
      throw error;
    }
  }
}
