import { adminAbility } from '#technical/capabilities/ability';
import type { PolicyCheck } from '#technical/capabilities/capability-check';

// Both of these describe the deployment, not a tenant's data: the route table
// with its request volumes and latencies on one side, the state of the
// database and the queue on the other. Neither has an own/team/all scope that
// means anything, so both ask the same question canReadAuditLog does -- is
// this caller trusted with something tenant scoping cannot contain.
export const canReadMetrics: PolicyCheck = adminAbility;

export const canReadHealth: PolicyCheck = adminAbility;
