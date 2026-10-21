import { adminAbility } from '#technical/capabilities/ability';
import type { PolicyCheck } from '#technical/capabilities/capability-check';

// A flow is a tenant's own background work, but what an operator does with it
// -- retrying a failed step re-runs code with side effects, cancelling drops
// work that was promised -- is not something every signed-in caller is trusted
// with. Reading and acting are separate decisions so a project can open one
// without the other by replacing a single export.
export const canReadJobFlows: PolicyCheck = adminAbility;

export const canManageJobFlows: PolicyCheck = adminAbility;
