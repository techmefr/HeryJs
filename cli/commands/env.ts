import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import type { Command } from 'commander';
import pc from 'picocolors';
import { dotEnvSource } from '../lib/env-source';
import { upsertEnvVar } from '../lib/env-file';

export function registerEnvCommand(program: Command): void {
  const env = program
    .command('env')
    .description(
      'Resolve environment variables through whichever source is configured -- .env today, any external manager that implements EnvSource tomorrow',
    );

  env
    .command('pull')
    .description('Write the resolved variables into .env')
    .action(async () => {
      const repoRoot = process.cwd();
      const source = dotEnvSource(repoRoot);
      const values = await source.load();
      const envPath = path.resolve(repoRoot, '.env');

      if (!existsSync(envPath)) {
        writeFileSync(envPath, '');
      }

      for (const [key, value] of Object.entries(values)) {
        upsertEnvVar(envPath, key, value);
      }

      console.log(
        pc.green(
          `✔ pulled ${Object.keys(values).length} variables from "${source.name}" into .env`,
        ),
      );
    });

  env
    .command('run')
    .description('Run a command with the resolved variables injected')
    .argument('<command...>', 'command to run, after --')
    .action(async (commandParts: string[]) => {
      const [command, ...args] = commandParts;

      if (!command) {
        console.log(
          pc.red(
            '✘ No command given -- usage: hery env run -- <command> [args...]',
          ),
        );
        process.exitCode = 1;
        return;
      }

      const source = dotEnvSource(process.cwd());
      const values = await source.load();

      // Values already in the environment win, the same rule load-env.ts
      // follows: a deliberate override in front of the command stays ahead of
      // whatever the source resolved.
      const childEnv = { ...values, ...process.env };

      const result = spawnSync(command, args, {
        env: childEnv,
        stdio: 'inherit',
        shell: process.platform === 'win32',
      });

      process.exitCode = result.status ?? 1;
    });
}
