import { createHash } from 'node:crypto';
import type { Request } from 'express';
import type { AuthenticatedUser } from '#technical/auth/auth.types';
import { subjectOf } from '#technical/capabilities/subject';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';

export const OUTPUT_CACHE_PREFIX = 'output:';

type RequestWithUser = Request & { user?: AuthenticatedUser };

/**
 * Everything a capability decision or a query can vary on goes into the hash:
 * the caller, the role and teams the presets read, an impersonation, the full
 * URL with its query and the requested language. The tenant is not in it
 * because CacheService already namespaces every key under the tenant, which
 * is the one guarantee the cache never leaves to its caller.
 */
export function callerScopeOf(request: RequestWithUser): string {
  const subject = request.user ? subjectOf(request.user) : null;

  return JSON.stringify([
    subject?.id ?? TenantContextStorage.getUserId(),
    subject?.role ?? null,
    subject?.currentTeamId ?? null,
    [...(subject?.teamIds ?? [])].sort(),
    request.user?.impersonatedBy ?? TenantContextStorage.getImpersonatedBy(),
  ]);
}

/**
 * `output:|Post|Tag|:<hash>` -- the models sit between bars so a write to
 * `Post` matches `*|Post|*` and never `PostTag`.
 */
export function outputCacheKey(
  request: RequestWithUser,
  models: string[],
): string {
  const hash = createHash('sha256')
    .update(callerScopeOf(request))
    .update('\n')
    .update(request.originalUrl)
    .update('\n')
    .update(request.header('accept-language') ?? '')
    .digest('hex');

  return `${OUTPUT_CACHE_PREFIX}|${[...models].sort().join('|')}|:${hash}`;
}

export function modelInvalidationPattern(model: string): string {
  return `${OUTPUT_CACHE_PREFIX}*|${model}|`;
}
