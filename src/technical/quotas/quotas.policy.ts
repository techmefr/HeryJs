import { adminAbility } from '#technical/capabilities/ability';
import type { PolicyCheck } from '#technical/capabilities/capability-check';

// Reading answers about the caller's own tenant, which scoping already
// bounds, but a limit and a count are operating figures of the deployment (they
// read as a price list to a tenant that is not meant to see how its plan was
// cut), so they stay with the operator until a project decides otherwise.
export const canReadQuotas: PolicyCheck = adminAbility;

export const canReadTenantQuotas: PolicyCheck = adminAbility;

export const canResetQuota: PolicyCheck = adminAbility;

// Setting an override names the tenant it applies to, so it reaches across the
// tenant boundary exactly like feature-flags does, and asks the same of the
// caller.
export const canSetQuotaOverride: PolicyCheck = adminAbility;
