import type { PolicyCheck } from '#technical/capabilities/capability-check';

export const canManageOwnSessions: PolicyCheck = () => ({
  allowed: true,
  scope: 'own',
});
