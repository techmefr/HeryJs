import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import {
  AUTH_BUCKET,
  DEFAULT_BUCKET,
  resolveRateLimitBucket,
} from './rate-limit.config';
import { RATE_LIMIT_BUCKET, RATE_LIMIT_EXEMPT } from './rate-limit.decorator';
import { RateLimitExceededException } from './rate-limit-exceeded.exception';
import { RateLimitStore } from './rate-limit-store';
import { RateLimitUnavailableException } from './rate-limit-unavailable.exception';

const logger = new Logger('RateLimitGuard');

/**
 * Global, unlike `CapabilitiesGuard`: a capability needs a policy wired to the
 * route it decides for, so opting a controller in is a decision to make once
 * per route. A rate limit protects the whole surface uniformly, and a route
 * this repository does not control -- a community module, one not yet
 * migrated -- still falls under the "read" bucket rather than under nothing.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly store: RateLimitStore,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }

    const exempt = this.reflector.getAllAndOverride<string | undefined>(
      RATE_LIMIT_EXEMPT,
      [context.getHandler(), context.getClass()],
    );

    if (exempt !== undefined) {
      return true;
    }

    const bucketName =
      this.reflector.getAllAndOverride<string | undefined>(RATE_LIMIT_BUCKET, [
        context.getHandler(),
        context.getClass(),
      ]) ?? DEFAULT_BUCKET;

    const bucket = resolveRateLimitBucket(bucketName);
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const key = this.keyFor(bucketName, request);

    const hit = await this.hitOrFailOpen(bucketName, key, bucket);

    if (hit === undefined) {
      return true;
    }

    response.setHeader('RateLimit-Limit', String(bucket.limit));
    response.setHeader('RateLimit-Remaining', String(hit.remaining));
    response.setHeader('RateLimit-Reset', String(hit.retryAfterSeconds));

    if (!hit.allowed) {
      response.setHeader('Retry-After', String(hit.retryAfterSeconds));
      throw new RateLimitExceededException(hit.retryAfterSeconds);
    }

    return true;
  }

  private async hitOrFailOpen(
    bucketName: string,
    key: string,
    bucket: { limit: number; windowSeconds: number },
  ) {
    try {
      return await this.store.hit(key, bucket.limit, bucket.windowSeconds);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`rate limit store unreachable: ${message}`);

      if (bucketName === AUTH_BUCKET) {
        throw new RateLimitUnavailableException();
      }

      return undefined;
    }
  }

  private keyFor(bucketName: string, request: Request): string {
    const tenantId = TenantContextStorage.getTenantId();
    const identity = TenantContextStorage.getUserId() ?? `ip:${request.ip}`;

    return `${bucketName}:${tenantId}:${identity}`;
  }
}
