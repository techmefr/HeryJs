import type { PolicyCheck } from '#technical/capabilities/capability-check';

export const canManageWebhooks: PolicyCheck = (subject) =>
  subject.role === 'admin'
    ? { allowed: true, scope: 'all' }
    : { allowed: false };
