import type { PolicyCheck } from '#technical/capabilities/capability-check';

// The audit log records who did what, including who impersonated whom
// (src/modules/impersonation writes its entries through this same log) --
// that is exactly the kind of record an ordinary team member should not be
// able to read about their own admins. Tenant scoping alone isn't enough
// here: everyone in the tenant is still "everyone", not "the operator".
export const canReadAuditLog: PolicyCheck = (subject) =>
  subject.role === 'admin'
    ? { allowed: true, scope: 'all' }
    : { allowed: false };
