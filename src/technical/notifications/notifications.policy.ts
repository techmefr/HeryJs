import type { PolicyCheck } from '#technical/capabilities/capability-check';

// Both routes resolve the recipient from the session, never from the request,
// so a caller can only ever list or mark its own notifications read.
export const canReadOwnNotifications: PolicyCheck = () => ({
  allowed: true,
  scope: 'own',
});
