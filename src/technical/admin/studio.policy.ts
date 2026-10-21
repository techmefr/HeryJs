import { adminAbility } from '#technical/capabilities/ability';
import type { PolicyCheck } from '#technical/capabilities/capability-check';

// Every account of the tenant, with its sessions and keys: that is the whole
// tenant's access, not the caller's own, so it is an operator's question.
export const canManageTenantAccess: PolicyCheck = adminAbility;

// Health, scheduled runs and the process environment say how the deployment
// is doing, which only the people operating it need to read.
export const canReadStudioOverview: PolicyCheck = adminAbility;
