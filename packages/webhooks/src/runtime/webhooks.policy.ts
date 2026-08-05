import type { PolicyCheck } from '#kernel/capabilities/capability-check';

export const canManageWebhooks: PolicyCheck = (subject) =>
  subject.role === 'admin'
    ? { allowed: true, scope: 'all' }
    : { allowed: false };
