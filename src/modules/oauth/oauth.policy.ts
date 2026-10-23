import type { PolicyCheck } from '#technical/public/capabilities';

export const canLinkOAuthIdentity: PolicyCheck = () => ({
  allowed: true,
  scope: 'own',
});
