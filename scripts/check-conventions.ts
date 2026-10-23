/**
 * Single entry point for the convention checks, so the whole set costs one
 * ts-node boot instead of one per check. Called with no argument it runs every
 * check; called with names it runs only those, which is what the per-check
 * package scripts do. Every selected check runs even when an earlier one fails,
 * so one pass reports everything that is wrong.
 *
 * The checks a project also runs ship in @heryjs/core/conventions and run here
 * on this repository; the rest are this repository's own.
 */
import * as path from 'node:path';
import {
  checkAdminContract,
  checkCapabilityDecorator,
  checkNoInlineDevGuard,
  checkNoRawPiiLog,
  checkRls,
  checkScopeParity,
  runConventionChecks,
  type ConventionCheck,
} from '@heryjs/core/conventions';
import { checkExampleFreshness } from './check-example-freshness';
import { checkKernelBoundary } from './check-kernel-boundary';
import { checkKernelVersion } from './check-kernel-version';
import { checkKernelVersions } from './check-kernel-versions';
import { checkLintCoverage } from './check-lint-coverage';
import { checkModuleDestinations } from './check-module-destinations';
import { checkModuleDrift } from './check-module-drift';
import { checkModulePatches } from './check-module-patches';
import { checkModuleValidity } from './check-module-validity';
import { checkNoFixedSleeps } from './check-no-fixed-sleeps';
import { checkPackageManifests } from './check-package-manifests';
import { checkPagination } from './check-pagination';
import { checkRateLimitDecorator } from './check-rate-limit-decorator';
import { checkRuntimeDependencies } from './check-runtime-dependencies';
import { checkSubjectConstruction } from './check-subject-construction';
import { checkTemplateImports } from './check-template-imports';
import { checkTenantIsolation } from './check-tenant-isolation';

const REPO_ROOT = path.resolve(__dirname, '..');

const CHECKS: ConventionCheck[] = [
  { name: 'capabilities', run: () => checkCapabilityDecorator(REPO_ROOT) },
  { name: 'admin-contract', run: () => checkAdminContract(REPO_ROOT) },
  { name: 'scope-parity', run: () => checkScopeParity(REPO_ROOT) },
  { name: 'rls', run: () => checkRls(REPO_ROOT) },
  { name: 'pagination', run: checkPagination },
  { name: 'rate-limit', run: checkRateLimitDecorator },
  { name: 'module-drift', run: checkModuleDrift },
  { name: 'module-validity', run: checkModuleValidity },
  { name: 'module-patches', run: checkModulePatches },
  { name: 'module-destinations', run: checkModuleDestinations },
  { name: 'kernel-boundary', run: checkKernelBoundary },
  { name: 'package-manifests', run: checkPackageManifests },
  { name: 'coverage', run: checkLintCoverage },
  { name: 'dev-guard', run: () => checkNoInlineDevGuard(REPO_ROOT) },
  { name: 'no-fixed-sleeps', run: checkNoFixedSleeps },
  { name: 'no-raw-pii-log', run: () => checkNoRawPiiLog(REPO_ROOT) },
  { name: 'subject', run: checkSubjectConstruction },
  { name: 'template-imports', run: checkTemplateImports },
  { name: 'tenant-isolation', run: checkTenantIsolation },
  { name: 'runtime-dependencies', run: checkRuntimeDependencies },
  { name: 'kernel-version', run: checkKernelVersion },
  { name: 'kernel-versions', run: checkKernelVersions },
  { name: 'example-freshness', run: checkExampleFreshness },
];

async function main(): Promise<void> {
  let failed: string[];

  try {
    failed = await runConventionChecks(CHECKS, process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }

  if (failed.length > 0) {
    process.exit(1);
  }
}

void main();
