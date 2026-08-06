import type { PolicyCheck } from '#technical/capabilities/capability-check';

/**
 * The devtools routes -- the request inspector, the pipeline traces, the
 * scheduler's task list, the router map, the seeders -- are bounded by the
 * environment, not by a role: DevOnlyGuard makes them stop existing in
 * production, and inside a development or test environment every signed-in
 * developer is meant to reach them. That is a decision, so it is written as a
 * capability rather than left as an absent one.
 */
export const canUseDevtools: PolicyCheck = () => ({
  allowed: true,
  scope: 'all',
});
