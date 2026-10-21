import { ability, adminAbility } from '#technical/capabilities/ability';
import type { PolicyCheck } from '#technical/capabilities/capability-check';

// The audit log records who did what, including who impersonated whom
// (src/modules/impersonation writes its entries through this same log) --
// that is exactly the kind of record an ordinary team member should not be
// able to read about their own admins. Tenant scoping alone isn't enough
// here: everyone in the tenant is still "everyone", not "the operator".
export const canReadAuditLog: PolicyCheck = adminAbility;

// An export moves the whole trail out of the system in one request, and a sink
// keeps sending it somewhere else for as long as it exists. Each is its own
// decision, a function of its own so the introspected name says which one a
// route is gated by, even though today all three resolve to the same rule.
export const canExportAuditLog: PolicyCheck = ability(
  (subject) => subject.role === 'admin',
);

export const canManageAuditSinks: PolicyCheck = ability(
  (subject) => subject.role === 'admin',
);
