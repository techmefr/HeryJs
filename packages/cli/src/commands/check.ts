import * as path from 'node:path';
import type { Command } from 'commander';
import {
  projectConventionChecks,
  runConventionChecks,
} from '@heryjs/core/conventions';
import { DEFAULT_BASELINE_PATH, lintAgainstBaseline, report } from './lint';

export function registerCheckCommand(program: Command): void {
  program
    .command('check [checks...]')
    .description(
      'Hold the project to the HeryJs conventions: the checks @heryjs/core ships (capabilities, admin contract, scope parity, row-level security, dev guard, fixed sleeps, PII in logs, subject construction, tenant isolation), then the hery lint rules against their baseline. Named checks run alone.',
    )
    .action(async (checks: string[]) => {
      const root = process.cwd();
      let failed: string[];

      try {
        failed = await runConventionChecks(
          projectConventionChecks(root),
          checks,
        );
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 2;
        return;
      }

      if (checks.length === 0) {
        const { fresh, grandfathered, score } = lintAgainstBaseline(
          root,
          path.resolve(root, DEFAULT_BASELINE_PATH),
        );

        report(fresh, grandfathered, score, 'text');

        if (fresh.length > 0) {
          failed.push('lint');
        }
      }

      if (failed.length > 0) {
        process.exitCode = 1;
      }
    });
}
