import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { from, Observable, of, switchMap } from 'rxjs';
import { CacheService } from '#technical/cache/cache.service';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { CACHE_OUTPUT_KEY } from './cache-output.decorator';
import type { CacheOutputOptions } from './cache-output.decorator';
import { outputCacheKey } from './output-cache-key';
import { OutputCacheStats } from './output-cache.stats';

export const OUTPUT_CACHE_HEADER = 'X-Output-Cache';

interface CachedOutput {
  body: unknown;
}

const SUCCESS_MIN = 200;
const SUCCESS_MAX = 299;

/**
 * Interceptors run after guards, so by the time this looks the cache up the
 * session and the capability check have already accepted the caller. A
 * request with no tenant is never cached: there would be no namespace to put
 * it in, and CacheService would refuse it anyway.
 */
@Injectable()
export class OutputCacheInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly cache: CacheService,
    private readonly stats: OutputCacheStats,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const options = this.reflector.get<CacheOutputOptions | undefined>(
      CACHE_OUTPUT_KEY,
      context.getHandler(),
    );
    const request = context.switchToHttp().getRequest<Request>();

    if (
      !options ||
      request.method !== 'GET' ||
      TenantContextStorage.findTenantId() === null
    ) {
      return next.handle();
    }

    const response = context.switchToHttp().getResponse<Response>();
    const key = outputCacheKey(request, options.models);
    const route =
      (request.route as { path?: string } | undefined)?.path ?? 'unmatched';

    return from(this.cache.get<CachedOutput>(key)).pipe(
      switchMap((cached) => {
        if (cached !== null) {
          this.stats.record(route, options.models, options.ttlSeconds, 'hit');
          response.setHeader(OUTPUT_CACHE_HEADER, 'HIT');

          return of(cached.body);
        }

        this.stats.record(route, options.models, options.ttlSeconds, 'miss');
        response.setHeader(OUTPUT_CACHE_HEADER, 'MISS');

        return next
          .handle()
          .pipe(
            switchMap((body: unknown) =>
              from(this.store(key, body, response, options)),
            ),
          );
      }),
    );
  }

  private async store(
    key: string,
    body: unknown,
    response: Response,
    options: CacheOutputOptions,
  ): Promise<unknown> {
    if (
      body !== undefined &&
      response.statusCode >= SUCCESS_MIN &&
      response.statusCode <= SUCCESS_MAX
    ) {
      await this.cache.set(key, { body }, options.ttlSeconds);
    }

    return body;
  }
}
