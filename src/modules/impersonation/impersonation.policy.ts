import type { PolicyCheck } from '#technical/capabilities/capability-check';

// Better Auth's own admin() plugin also refuses this server-side (it is the
// only thing granting the "impersonate" permission to a role) -- this gate
// makes that same decision visible to HeryJs's own capability system, so the
// route is authorized the same way every other route in the framework is.
export const canImpersonate: PolicyCheck = (subject) =>
  subject.role === 'admin'
    ? { allowed: true, scope: 'all' }
    : { allowed: false };

// Stopping is the way back out of a session the caller is already inside, so it
// asks nothing of the role: an impersonated caller is by definition not an
// admin, and refusing them here would trap them in the session.
export const canStopImpersonation: PolicyCheck = () => ({
  allowed: true,
  scope: 'own',
});
