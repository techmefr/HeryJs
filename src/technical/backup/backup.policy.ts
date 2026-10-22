import { operatorAbility } from '#technical/capabilities/ability';
import type { PolicyCheck } from '#technical/capabilities/capability-check';

// A dump holds every tenant's data and a restore overwrites all of it, so
// neither has a scope that means anything below "an administrator".
export const canManageBackups: PolicyCheck = operatorAbility;
