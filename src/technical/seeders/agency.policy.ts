import type { PolicyCheck } from '#technical/capabilities/capability-check';

// Bulk-creating users and teams is a dev/test convenience, not a tenant-scoped
// action -- the same all-or-nothing shape as canManagePrune.
export const canSeedAgency: PolicyCheck = (subject) =>
  subject.role === 'admin'
    ? { allowed: true, scope: 'all' }
    : { allowed: false };
