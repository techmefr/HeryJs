import type { PolicyCheck } from '#technical/capabilities/capability-check';

/**
 * A signal carries no payload -- only the name of a channel that changed, so a
 * subscriber knows to re-read through the routes it is already allowed to read
 * through. Every signed-in caller may therefore ask for a token, and the token
 * itself is bound to the tenant the session resolved to, never to a channel
 * list the caller chose.
 */
export const canIssueSignalToken: PolicyCheck = () => ({
  allowed: true,
  scope: 'own',
});
