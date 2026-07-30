/**
 * Single entry point for the convention checks, so the whole set costs one
 * ts-node boot instead of one per check. Called with no argument it runs every
 * check; called with names it runs only those, which is what the per-check
 * package scripts do. Every selected check runs even when an earlier one fails,
 * so one pass reports everything that is wrong.
 */
import { checkCapabilityDecorator } from './check-capability-decorator';
import { checkLintCoverage } from './check-lint-coverage';
import { checkNoInlineDevGuard } from './check-no-inline-dev-guard';
import { checkScopeParity } from './check-scope-parity';
import { checkSubjectConstruction } from './check-subject-construction';
import { checkTemplateImports } from './check-template-imports';

const CHECKS: Array<{ name: string; run: () => boolean }> = [
  { name: 'capabilities', run: checkCapabilityDecorator },
  { name: 'scope-parity', run: checkScopeParity },
  { name: 'coverage', run: checkLintCoverage },
  { name: 'dev-guard', run: checkNoInlineDevGuard },
  { name: 'subject', run: checkSubjectConstruction },
  { name: 'template-imports', run: checkTemplateImports },
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

const failed = selected.filter((check) => {
  try {
    return !check.run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✖ ${check.name} could not run: ${message}`);
    return true;
  }
});

if (failed.length > 0) {
  console.error(
    `\n${failed.length} of ${selected.length} convention checks failed: ${failed
      .map((check) => check.name)
      .join(', ')}`,
  );
  process.exit(1);
}
