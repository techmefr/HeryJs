import { adminAbility } from '#technical/capabilities/ability';
import type { PolicyCheck } from '#technical/capabilities/capability-check';

// The log lists every message the tenant sent, with each recipient's address:
// that is the tenant's whole correspondence, not the caller's own, so it asks
// the same question canReadAuditLog does rather than falling back to a scope.
export const canReadMailLog: PolicyCheck = adminAbility;

// A test send puts a real message on the configured transport, to an address
// the caller chose, so it is an operator's action and not a user's.
export const canSendTestMail: PolicyCheck = adminAbility;
