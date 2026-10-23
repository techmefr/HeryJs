import { spawnSync } from 'node:child_process';
import type { Command } from 'commander';
import pc from 'picocolors';

export const UPGRADE_STEPS: readonly (readonly string[])[] = [
  ['kernel:migrate'],
  ['check'],
];

export type StepRunner = (args: readonly string[]) => number;

const runHery: StepRunner = (args) =>
  spawnSync('pnpm', ['hery', ...args], { stdio: 'inherit' }).status ?? 1;

export function runUpgrade(run: StepRunner = runHery): number {
  for (const step of UPGRADE_STEPS) {
    console.log(pc.cyan(`→ hery ${step.join(' ')}`));
    const status = run(step);

    if (status !== 0) {
      console.error(pc.red(`✖ hery ${step.join(' ')} failed, upgrade stopped`));
      return status;
    }
  }

  console.log(pc.green('✔ project upgraded and conventions hold'));
  return 0;
}

export function registerUpgradeCommand(
  program: Command,
  run: StepRunner = runHery,
): void {
  program
    .command('upgrade')
    .description(
      'After bumping @heryjs/* (by hand or through the HeryJs Renovate preset): run "hery kernel:migrate", then "hery check", and stop at the first that fails.',
    )
    .action(() => {
      const status = runUpgrade(run);

      if (status !== 0) {
        process.exitCode = status;
      }
    });
}
