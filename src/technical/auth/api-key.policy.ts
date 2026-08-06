import type { PolicyCheck } from '#technical/capabilities/capability-check';

// A key belongs to the caller that created it, and every route here already
// reads the owner off the session rather than the request -- so the scope is
// always own, and there is no tier where one caller manages another's keys.
// Whether the *credential* in hand may manage keys at all is a separate
// question, answered by assertNotApiKey in the controller: a leaked key must
// not be able to mint more.
export const canManageOwnApiKeys: PolicyCheck = () => ({
  allowed: true,
  scope: 'own',
});
