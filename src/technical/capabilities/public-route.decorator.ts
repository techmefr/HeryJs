import { SetMetadata } from '@nestjs/common';

export const PUBLIC_ROUTE_REASON = 'capability:public-route-reason';

/**
 * The handful of routes that cannot carry a capability, because there is no
 * caller yet to resolve one against: logging in, the routes authenticated by a
 * signature or a signed token rather than a session, the service banner.
 *
 * CapabilitiesGuard lets a route through when no capability metadata is
 * present, so "no capability" and "forgot the capability" look identical to it.
 * This decorator is what tells them apart: `lint:capabilities` requires every
 * route to carry either a @Capability or this, and the reason is written down
 * where the route is, not in a list somewhere else that stops matching it.
 */
export const PublicRoute = (reason: string) =>
  SetMetadata(PUBLIC_ROUTE_REASON, reason);
