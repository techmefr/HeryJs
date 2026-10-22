import { adminOrOperatorAbility } from '#technical/capabilities/ability';
import type { PolicyCheck } from '#technical/capabilities/capability-check';

// A tenant admin manages the flags of its own tenant; the controller pins the
// tenant for it. Global flags and other tenants' flags are the platform
// operator's, the controller refuses them to anyone else.
export const canManageFeatureFlags: PolicyCheck = adminOrOperatorAbility;

export const canEvaluateFeatureFlags: PolicyCheck = (subject, record) =>
  adminOrOperatorAbility(subject, record);
