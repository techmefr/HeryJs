import { adminAbility } from '#technical/capabilities/ability';
import type { PolicyCheck } from '#technical/capabilities/capability-check';

// This controller can list and set flags for ANY tenant (that's the point --
// it is the surface that lets an operator target a specific customer or roll
// a flag out globally). That cross-tenant reach has to be admin-only, the
// same way impersonation is, or any authenticated user in any tenant could
// read or flip every other tenant's flags through this same route.
export const canManageFeatureFlags: PolicyCheck = adminAbility;

// The preview takes any tenant and user id in its body, so it is the same
// cross-tenant reach as the write routes. It is bound under its own name so
// the introspected capability says what the route does.
export const canEvaluateFeatureFlags: PolicyCheck = (subject, record) =>
  adminAbility(subject, record);
