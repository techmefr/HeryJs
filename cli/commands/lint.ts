import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import type { Command } from 'commander';
import pc from 'picocolors';
import {
  baselineFrom,
  loadBaseline,
  partitionViolations,
  writeBaseline,
} from '../lib/lint/baseline';
import { LINT_RULES } from '../lib/lint/rules';
import { scoreOf } from '../lib/lint/score';
import type { Violation } from '../lib/lint/types';

const DEFAULT_BASELINE_PATH = '.hery/lint-baseline.json';

interface LintOptions {
  minScore?: string;
  baseline: string;
  writeBaseline?: boolean;
  format: 'text' | 'json';
}

function report(
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

      const violations = LINT_RULES.flatMap((rule) => rule.run(repoRoot));

      const fileContents = new Map<string, string>();
      for (const violation of violations) {
        if (!fileContents.has(violation.file)) {
          fileContents.set(
            violation.file,
            readFileSync(path.join(repoRoot, violation.file), 'utf8'),
          );
        }
      }

      if (options.writeBaseline) {
        writeBaseline(baselinePath, baselineFrom(violations, fileContents));
        console.log(
          pc.green(
            `✔ wrote ${violations.length} known violation${violations.length === 1 ? '' : 's'} to ${options.baseline}`,
          ),
        );
        return;
      }

      const baseline = loadBaseline(baselinePath);
      const { fresh, grandfathered } = partitionViolations(
        violations,
        baseline,
        fileContents,
      );
      const score = scoreOf(fresh);

      report(fresh, grandfathered, score, options.format);

      const minScore =
        options.minScore !== undefined ? Number(options.minScore) : undefined;

      if (minScore !== undefined && score < minScore) {
        process.exitCode = 1;
      }
    });
}
