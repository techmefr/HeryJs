import { heryConfig } from '#technical/config/hery-config';
import type { HeryConfigRateLimitBucket } from '#technical/config/hery-config.types';

export const DEFAULT_BUCKET = 'read';
export const AUTH_BUCKET = 'auth';

/**
 * Hardcoded rather than left absent like `prune`'s: omitting that block turns
 * pruning off, and the cost of getting that wrong is silence. Omitting
 * `rateLimit` here still leaves every request counted, because the cost of
 * getting this one wrong the other way is a credential-stuffing loop with no
 * ceiling. `hery.config.ts` overrides a bucket; it cannot remove the guard.
 */
const FALLBACK_BUCKETS: Record<string, HeryConfigRateLimitBucket> = {
  read: { limit: 120, windowSeconds: 60 },
  write: { limit: 30, windowSeconds: 60 },
  [AUTH_BUCKET]: { limit: 5, windowSeconds: 300 },
};

export function resolveRateLimitBucket(
  name: string,
): HeryConfigRateLimitBucket {
  const bucket =
    heryConfig.rateLimit?.buckets[name] ??
    FALLBACK_BUCKETS[name] ??
    FALLBACK_BUCKETS[DEFAULT_BUCKET];

  if (!bucket) {
    throw new Error(`No rate limit bucket configured for "${DEFAULT_BUCKET}"`);
  }

  return bucket;
}
