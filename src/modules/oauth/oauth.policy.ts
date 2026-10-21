import type { PolicyCheck } from '#technical/capabilities/capability-check';

export const canLinkOAuthIdentity: PolicyCheck = () => ({
  allowed: true,
  scope: 'own',
});
