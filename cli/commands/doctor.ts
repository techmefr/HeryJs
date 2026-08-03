import type { Command } from 'commander';
import pc from 'picocolors';
import { runInfraChecks } from '../lib/infra-checks';
import type { CheckResult } from '../lib/infra-checks';

/**
 * Both config modules throw at import time when they are invalid --
 * `env.ts`'s `export const env = parseEnv(process.env)` and
 * `hery-config.ts`'s `export const heryConfig = loadHeryConfig()` are not
 * lazy. A static `import` of either would take the whole `hery` process down
 * with them before this command's own action ever ran, which is the exact
 * failure doctor exists to explain instead of just crash on. `require()`
 * inside a try/catch is the only way to turn that throw into a diagnosis.
 */
function checkEnv(): CheckResult {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('#technical/config/env');
    return { label: 'Environment variables', ok: true };
  } catch (error) {
    return {
      label: 'Environment variables',
      ok: false,
      hint: (error instanceof Error ? error.message : String(error)).replace(
        /\n/g,
        ' ',
      ),
    };
  }
}

function checkHeryConfig(): CheckResult {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { heryConfig } = require('#technical/config/hery-config') as {
      heryConfig: {
        search?: { default: string; engines: Record<string, unknown> };
      };
    };

    const search = heryConfig.search;

    if (search && !(search.default in search.engines)) {
      return {
        label: 'hery.config.ts',
        ok: false,
        hint: `search.default "${search.default}" is not a key of search.engines`,
      };
    }

    return { label: 'hery.config.ts', ok: true };
  } catch (error) {
    return {
      label: 'hery.config.ts',
      ok: false,
      hint: (error instanceof Error ? error.message : String(error)).replace(
        /\n/g,
        ' ',
      ),
    };
  }
}

export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description(
      'One command for everything that would otherwise fail piecemeal -- environment variables, hery.config.ts, and local infra',
    )
    .action(async () => {
      const checks: CheckResult[] = [
        checkEnv(),
        checkHeryConfig(),
        ...(await runInfraChecks()),
      ];

      let allOk = true;

      for (const check of checks) {
        const icon = check.ok ? pc.green('✔') : pc.red('✘');
        const hint = check.hint ? pc.dim(` — ${check.hint}`) : '';
        console.log(`${icon} ${check.label}${hint}`);
        allOk &&= check.ok;
      }

      process.exitCode = allOk ? 0 : 1;
    });
}
