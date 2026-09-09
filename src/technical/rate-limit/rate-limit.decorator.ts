import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_BUCKET = 'rate-limit:bucket';
export const RATE_LIMIT_EXEMPT = 'rate-limit:exempt';

export const RateLimit = (bucket: string) =>
  SetMetadata(RATE_LIMIT_BUCKET, bucket);

/**
 * The rate-limit counterpart of `@PublicRoute`: a route that genuinely takes
 * no ceiling -- a webhook signed by its sender, a health check -- says so with
 * a reason instead of leaving the check to guess why it carries neither
 * decorator.
 */
export const UnthrottledRoute = (reason: string) =>
  SetMetadata(RATE_LIMIT_EXEMPT, reason);
