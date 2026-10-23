import type { PolicyCheck } from '@heryjs/core/capabilities';

export const canLinkOAuthIdentity: PolicyCheck = () => ({
  allowed: true,
  scope: 'own',
});
