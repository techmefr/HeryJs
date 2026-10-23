import { adminOrOperatorAbility } from '#technical/capabilities/ability';
import type { PolicyCheck } from '#technical/capabilities/capability-check';
import {
  devEnvironmentsOf,
  isSharedDevEnvironment,
} from '#technical/config/dev-environments';
import { heryConfig } from '#technical/config/hery-config';

/**
 * The devtools routes -- the request inspector, the pipeline traces, the
 * scheduler's task list, the router map, the seeders -- are bounded by the
 * environment, not by a role: DevOnlyGuard makes them stop existing outside
 * `devTools.environments`, and inside a development or test environment every
 * signed-in developer is meant to reach them. That is a decision, so it is
 * written as a capability rather than left as an absent one.
 */
export const canUseDevtools: PolicyCheck = () => ({
  allowed: true,
  scope: 'all',
});

/**
 * Seeders write data. In development and test any signed-in developer runs
 * them; in a shared environment listed on top of those (a demo) they narrow to
 * an admin or the platform operator, read per decision like NODE_ENV itself.
 */
export const canRunSeeders: PolicyCheck = (subject) =>
  isSharedDevEnvironment(process.env.NODE_ENV, devEnvironmentsOf(heryConfig))
    ? adminOrOperatorAbility(subject)
    : canUseDevtools(subject);
