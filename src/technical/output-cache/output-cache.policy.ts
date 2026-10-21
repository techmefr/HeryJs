import { adminAbility } from '#technical/capabilities/ability';
import type { PolicyCheck } from '#technical/capabilities/capability-check';

// The per-route counters describe the deployment, not a tenant's data, the
// same thing canReadMetrics guards.
export const canReadOutputCache: PolicyCheck = adminAbility;

// A flush only costs the tenant a few cold reads, but it is an operator's
// lever, not a user's.
export const canFlushOutputCache: PolicyCheck = adminAbility;
