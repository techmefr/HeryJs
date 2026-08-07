/**
 * Single entry point for the convention checks, so the whole set costs one
 * ts-node boot instead of one per check. Called with no argument it runs every
 * check; called with names it runs only those, which is what the per-check
 * package scripts do. Every selected check runs even when an earlier one fails,
 * so one pass reports everything that is wrong.
 */
import { checkCapabilityDecorator } from './check-capability-decorator';
import { checkExampleFreshness } from './check-example-freshness';
import { checkLintCoverage } from './check-lint-coverage';
import { checkModuleDrift } from './check-module-drift';
import { checkNoInlineDevGuard } from './check-no-inline-dev-guard';
import { checkPagination } from './check-pagination';
import { checkRls } from './check-rls';
import { checkScopeParity } from './check-scope-parity';
import { checkSubjectConstruction } from './check-subject-construction';
import { checkTemplateImports } from './check-template-imports';

const CHECKS: Array<{ name: string; run: () => boolean | Promise<boolean> }> = [
  { name: 'capabilities', run: checkCapabilityDecorator },
  { name: 'scope-parity', run: checkScopeParity },
  { name: 'rls', run: checkRls },
  { name: 'pagination', run: checkPagination },
  { name: 'module-drift', run: checkModuleDrift },
  { name: 'coverage', run: checkLintCoverage },
  { name: 'dev-guard', run: checkNoInlineDevGuard },
  { name: 'subject', run: checkSubjectConstruction },
  { name: 'template-imports', run: checkTemplateImports },
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
