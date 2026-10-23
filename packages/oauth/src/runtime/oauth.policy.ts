import type { PolicyCheck } from '#kernel/public/capabilities';

export const canLinkOAuthIdentity: PolicyCheck = () => ({
  allowed: true,
  scope: 'own',
});
