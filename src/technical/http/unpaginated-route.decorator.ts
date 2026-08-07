import { SetMetadata } from '@nestjs/common';

export const UNPAGINATED_ROUTE_REASON = 'unpaginatedRouteReason';

/**
 * Marks a collection route that deliberately returns everything it has: a
 * static registry the code itself bounds (the route table, the scheduled tasks,
 * the exposed actions) or a capped in-memory buffer. lint:pagination refuses any
 * other collection route that does not page, so "this one does not need it" has
 * to be written down with its reason rather than assumed by whoever reads it
 * next.
 */
export const UnpaginatedRoute = (reason: string) =>
  SetMetadata(UNPAGINATED_ROUTE_REASON, reason);
