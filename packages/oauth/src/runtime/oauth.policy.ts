import type { PolicyCheck } from '#kernel/capabilities/capability-check';

export const canLinkOAuthIdentity: PolicyCheck = () => ({
  allowed: true,
  scope: 'own',
});
