import type { PolicyCheck } from '#technical/capabilities/capability-check';

/**
 * The route is a dispatcher, so this is deliberately the weakest check in the
 * codebase: it says a signed-in caller may address the mine at all. What the
 * caller may actually see or run is decided one layer in, by each action's own
 * capability -- ExpositionRunner resolves it before invoking, and the catalog
 * filters on the same check. A capability here that tried to answer for every
 * registered action would either lock out actions meant to be broad or hand out
 * ones meant to be narrow.
 */
export const canReachExposedActions: PolicyCheck = () => ({
  allowed: true,
  scope: 'own',
});
