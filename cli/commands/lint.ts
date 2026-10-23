import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import type { Command } from 'commander';
import pc from 'picocolors';
import {
  LINT_RULES,
  baselineFrom,
  loadBaseline,
  partitionViolations,
  scoreOf,
  writeBaseline,
} from '@heryjs/cli/lint';
import type { Violation } from '@heryjs/cli/lint';

export const DEFAULT_BASELINE_PATH = '.hery/lint-baseline.json';

// A violation can be anchored on a file that does not exist -- resource-shape
// used to do exactly that for the companion file it flags as missing.
// partitionViolations and baselineFrom already treat "no content" as '',
// so tolerating ENOENT here rather than crashing keeps the two consistent
// instead of the whole command going down on the one path most likely to
// hit a missing file.
function readFileOrEmpty(repoRoot: string, relativeFile: string): string {
  try {
    return readFileSync(path.join(repoRoot, relativeFile), 'utf8');
  } catch {
    return '';
  }
}

interface LintOptions {
  minScore?: string;
  baseline: string;
  writeBaseline?: boolean;
  format: 'text' | 'json';
}

function contentsOf(
  repoRoot: string,
  violations: Violation[],
): Map<string, string> {
  const fileContents = new Map<string, string>();

  for (const violation of violations) {
    if (!fileContents.has(violation.file)) {
      fileContents.set(
        violation.file,
        readFileOrEmpty(repoRoot, violation.file),
      );
    }
  }

  return fileContents;
}

/**
 * The violations the baseline does not grandfather, scored. `hery check` runs
 * this too, so a project's lint rules and its convention checks pass or fail
 * as one command.
 */
export function lintAgainstBaseline(
  repoRoot: string,
  baselinePath: string,
): { fresh: Violation[]; grandfathered: number; score: number } {
  const violations = LINT_RULES.flatMap((rule) => rule.run(repoRoot));
  const { fresh, grandfathered } = partitionViolations(
    violations,
    loadBaseline(baselinePath),
    contentsOf(repoRoot, violations),
  );

  return { fresh, grandfathered, score: scoreOf(fresh) };
}

export function report(
  fresh: Violation[],
  grandfathered: number,
  score: number,
  format: 'text' | 'json',
): void {
  if (format === 'json') {
    console.log(
      JSON.stringify({ score, grandfathered, violations: fresh }, null, 2),
    );
    return;
  }

  if (fresh.length === 0) {
    console.log(
      pc.green(
        `✔ hery lint: ${score}/100 (${grandfathered} known violation${grandfathered === 1 ? '' : 's'} grandfathered by the baseline)`,
      ),
    );
    return;
  }

  console.error(`hery lint: ${score}/100\n`);

  const byRule = new Map<string, Violation[]>();
  for (const violation of fresh) {
    byRule.set(violation.rule, [
      ...(byRule.get(violation.rule) ?? []),
      violation,
    ]);
  }

  for (const [rule, violations] of byRule) {
    console.error(pc.bold(rule));
    for (const violation of violations) {
      console.error(`  ${violation.message}`);
    }
    console.error('');
  }

  if (grandfathered > 0) {
    console.error(
      pc.dim(
        `${grandfathered} other known violation${grandfathered === 1 ? '' : 's'} grandfathered by the baseline.`,
      ),
    );
  }
}

export function registerLintCommand(program: Command): void {
  program
    .command('lint')
    .description(
      'Score the project against conventions the architecture linter and eslint do not reach -- forbidden patterns and the shape a generated resource is supposed to keep',
    )
    .option(
      '--min-score <n>',
      'exit non-zero when the score falls below this threshold',
    )
    .option(
      '--baseline <path>',
      'baseline file grandfathering already-known violations',
      DEFAULT_BASELINE_PATH,
    )
    .option(
      '--write-baseline',
      'snapshot every current violation into the baseline instead of scoring against it',
    )
    .option('--format <format>', 'text or json', 'text')
    .action((options: LintOptions) => {
      const repoRoot = path.resolve(__dirname, '..', '..');
      const baselinePath = path.resolve(repoRoot, options.baseline);

      if (options.writeBaseline) {
        const violations = LINT_RULES.flatMap((rule) => rule.run(repoRoot));

        writeBaseline(
          baselinePath,
          baselineFrom(violations, contentsOf(repoRoot, violations)),
        );
        console.log(
          pc.green(
            `✔ wrote ${violations.length} known violation${violations.length === 1 ? '' : 's'} to ${options.baseline}`,
          ),
        );
        return;
      }

      const { fresh, grandfathered, score } = lintAgainstBaseline(
        repoRoot,
        baselinePath,
      );

      report(fresh, grandfathered, score, options.format);

      const minScore =
        options.minScore !== undefined ? Number(options.minScore) : undefined;

      if (minScore !== undefined && score < minScore) {
        process.exitCode = 1;
      }
    });
}
