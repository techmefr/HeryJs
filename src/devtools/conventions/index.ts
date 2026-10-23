import { checkAdminContract } from './check-admin-contract';
import { checkCapabilityDecorator } from './check-capability-decorator';
import { checkNoFixedSleeps } from './check-no-fixed-sleeps';
import { checkNoInlineDevGuard } from './check-no-inline-dev-guard';
import { checkNoRawPiiLog } from './check-no-raw-pii-log';
import { checkRls } from './check-rls';
import { checkScopeParity } from './check-scope-parity';
import { checkSubjectConstruction } from './check-subject-construction';
import { checkTenantIsolation } from './check-tenant-isolation';

export { adminContractViolations } from './check-admin-contract';
export { rawLogArguments } from './check-no-raw-pii-log';
export {
  installedModuleDirs,
  TENANT_ISOLATION_BLOCK,
} from './check-tenant-isolation';
export {
  checkAdminContract,
  checkCapabilityDecorator,
  checkNoFixedSleeps,
  checkNoInlineDevGuard,
  checkNoRawPiiLog,
  checkRls,
  checkScopeParity,
  checkSubjectConstruction,
  checkTenantIsolation,
};
export type { FixedSleepScope } from './check-no-fixed-sleeps';

export interface ConventionCheck {
  name: string;
  run: () => boolean | Promise<boolean>;
}

/**
 * The checks that hold a project's own code to the conventions, run by
 * `hery check` against the project root. They ship with the kernel so a
 * project runs the version it depends on, and the framework repository runs
 * the same functions on itself, with its own wider scope.
 */
export function projectConventionChecks(root: string): ConventionCheck[] {
  return [
    { name: 'capabilities', run: () => checkCapabilityDecorator(root) },
    { name: 'admin-contract', run: () => checkAdminContract(root) },
    { name: 'scope-parity', run: () => checkScopeParity(root) },
    { name: 'rls', run: () => checkRls(root) },
    { name: 'dev-guard', run: () => checkNoInlineDevGuard(root) },
    { name: 'no-fixed-sleeps', run: () => checkNoFixedSleeps(root) },
    { name: 'no-raw-pii-log', run: () => checkNoRawPiiLog(root) },
    { name: 'subject', run: () => checkSubjectConstruction(root) },
    { name: 'tenant-isolation', run: () => checkTenantIsolation(root) },
  ];
}

/**
 * Runs the named checks, or all of them, each one even when an earlier one
 * failed, so one pass reports everything that is wrong. Resolves to the names
 * that failed; an unknown name is thrown before anything runs.
 */
export async function runConventionChecks(
  checks: ConventionCheck[],
  requested: string[] = [],
): Promise<string[]> {
  const unknown = requested.filter(
    (name) => !checks.some((check) => check.name === name),
  );

  if (unknown.length > 0) {
    throw new Error(
      `Unknown check: ${unknown.join(', ')}\nAvailable: ${checks.map((check) => check.name).join(', ')}`,
    );
  }

  const selected =
    requested.length > 0
      ? checks.filter((check) => requested.includes(check.name))
      : checks;
  const failed: string[] = [];

  for (const check of selected) {
    try {
      if (!(await check.run())) {
        failed.push(check.name);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`✖ ${check.name} could not run: ${message}`);
      failed.push(check.name);
    }
  }

  if (failed.length > 0) {
    console.error(
      `\n${failed.length} of ${selected.length} convention checks failed: ${failed.join(', ')}`,
    );
  }

  return failed;
}
