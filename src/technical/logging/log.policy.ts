import { adminAbility } from '#technical/capabilities/ability';
import type { PolicyCheck } from '#technical/capabilities/capability-check';

/**
 * The persisted log is everything the tenant's application said, request paths
 * and error messages included, which is far more than any one caller's own
 * activity. There is no own or team scope that means anything for it, so it asks
 * what canReadAuditLog asks: is this caller trusted with something ordinary
 * tenant scoping cannot contain.
 */
export const canReadLogs: PolicyCheck = adminAbility;
