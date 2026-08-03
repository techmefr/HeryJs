import type { PolicyCheck } from '#technical/capabilities/capability-check';

// Pruning is a hard, irreversible delete across every tenant at once -- the
// same reasoning as canReadAuditLog applies with even less room for error:
// there is no "own" or "team" scope that means anything here, only whether
// the caller is trusted with an operation ordinary tenant scoping can't
// contain.
export const canManagePrune: PolicyCheck = (subject) =>
  subject.role === 'admin'
    ? { allowed: true, scope: 'all' }
    : { allowed: false };
