import { adminAbility } from '#technical/capabilities/ability';
import type { PolicyCheck } from '#technical/capabilities/capability-check';

/**
 * Outside production the dashboard is for whoever is developing, which is the
 * stance every devtools route takes. In production it is only reachable when a
 * project switched recording on in hery.config.ts, and what it then holds is a
 * tenant's requests, statements and recipients, so it asks for the admin
 * capability instead of being open to every signed-in caller.
 *
 * Read at call time, not import time: the environment is the thing being
 * decided, and a module-level constant would freeze the answer at boot.
 */
export const canUseDevDashboard: PolicyCheck = (subject) =>
  process.env.NODE_ENV === 'production'
    ? adminAbility(subject)
    : { allowed: true, scope: 'all' };
