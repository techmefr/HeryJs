import type { PolicyCheck } from '#technical/capabilities/capability-check';

// The log lists every message the tenant sent, with each recipient's address:
// that is the tenant's whole correspondence, not the caller's own, so it asks
// the same question canReadAuditLog does rather than falling back to a scope.
export const canReadMailLog: PolicyCheck = (subject) =>
  subject.role === 'admin'
    ? { allowed: true, scope: 'all' }
    : { allowed: false };
