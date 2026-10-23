/**
 * Single entry point for the convention checks, so the whole set costs one
 * ts-node boot instead of one per check. Called with no argument it runs every
 * check; called with names it runs only those, which is what the per-check
 * package scripts do. Every selected check runs even when an earlier one fails,
 * so one pass reports everything that is wrong.
 */
import { checkAdminContract } from './check-admin-contract';
import { checkCapabilityDecorator } from './check-capability-decorator';
import { checkExampleFreshness } from './check-example-freshness';
import { checkKernelBoundary } from './check-kernel-boundary';
import { checkKernelVersion } from './check-kernel-version';
import { checkLintCoverage } from './check-lint-coverage';
import { checkModuleDrift } from './check-module-drift';
import { checkModulePatches } from './check-module-patches';
import { checkModuleValidity } from './check-module-validity';
import { checkNoFixedSleeps } from './check-no-fixed-sleeps';
import { checkNoInlineDevGuard } from './check-no-inline-dev-guard';
import { checkNoRawPiiLog } from './check-no-raw-pii-log';
import { checkPackageManifests } from './check-package-manifests';
import { checkPagination } from './check-pagination';
import { checkRateLimitDecorator } from './check-rate-limit-decorator';
import { checkRls } from './check-rls';
import { checkRuntimeDependencies } from './check-runtime-dependencies';
import { checkScopeParity } from './check-scope-parity';
import { checkSubjectConstruction } from './check-subject-construction';
import { checkTemplateImports } from './check-template-imports';
import { checkTenantIsolation } from './check-tenant-isolation';

const CHECKS: Array<{ name: string; run: () => boolean | Promise<boolean> }> = [
  { name: 'capabilities', run: checkCapabilityDecorator },
  { name: 'admin-contract', run: checkAdminContract },
  { name: 'scope-parity', run: checkScopeParity },
  { name: 'rls', run: checkRls },
  { name: 'pagination', run: checkPagination },
  { name: 'rate-limit', run: checkRateLimitDecorator },
  { name: 'module-drift', run: checkModuleDrift },
  { name: 'module-validity', run: checkModuleValidity },
  { name: 'module-patches', run: checkModulePatches },
  { name: 'kernel-boundary', run: checkKernelBoundary },
  { name: 'package-manifests', run: checkPackageManifests },
  { name: 'coverage', run: checkLintCoverage },
  { name: 'dev-guard', run: checkNoInlineDevGuard },
  { name: 'no-fixed-sleeps', run: checkNoFixedSleeps },
  { name: 'no-raw-pii-log', run: checkNoRawPiiLog },
  { name: 'subject', run: checkSubjectConstruction },
  { name: 'template-imports', run: checkTemplateImports },
  { name: 'tenant-isolation', run: checkTenantIsolation },
  { name: 'runtime-dependencies', run: checkRuntimeDependencies },
  { name: 'kernel-version', run: checkKernelVersion },
  { name: 'example-freshness', run: checkExampleFreshness },
];

const requested = process.argv.slice(2);
const unknown = requested.filter(
  (name) => !CHECKS.some((check) => check.name === name),
);

if (unknown.length > 0) {
  console.error(`Unknown check: ${unknown.join(', ')}`);
  console.error(`Available: ${CHECKS.map((check) => check.name).join(', ')}`);
  process.exit(2);
}

const selected =
  requested.length > 0
    ? CHECKS.filter((check) => requested.includes(check.name))
    : CHECKS;

async function main(): Promise<void> {
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
    process.exit(1);
  }
}

void main();
