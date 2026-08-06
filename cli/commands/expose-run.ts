import { NestFactory } from '@nestjs/core';
import type { Command } from 'commander';
import pc from 'picocolors';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';

function collectParam(
  value: string,
  previous: Record<string, string>,
): Record<string, string> {
  const [name, ...rest] = value.split('=');

  if (!name || rest.length === 0) {
    throw new Error(`--param expects name=value, got "${value}"`);
  }

  return { ...previous, [name]: rest.join('=') };
}

/**
 * The application module is loaded inside the action, not imported at the
 * top, for the same reason console.ts defers it: a static import reaches
 * env.ts at module-load time, which would take down every other command on
 * an invalid environment.
 */
export function registerExposeRunCommand(program: Command): void {
  program
    .command('expose:run <action>')
    .description(
      'Run an action exposed to the mine, bypassing its capability check -- a shell on the machine is the trust here, not a signed-in user',
    )
    .option('--tenant <tenantId>', 'tenant id to run the action as', 'default')
    .option(
      '--param <nameValue>',
      'name=value, repeatable; unset params fall back to their declared default',
      collectParam,
      {},
    )
    .action(
      async (
        actionName: string,
        options: { tenant: string; param: Record<string, string> },
      ) => {
        const { AppModule } = await import('#app.module');
        const { ExpositionRegistry } =
          await import('#technical/exposition/exposition.registry');
        const { ExpositionRunner } =
          await import('#technical/exposition/exposition-runner.service');
        const { coerceCliValue } =
          await import('#technical/exposition/exposition-validation');

        const app = await NestFactory.createApplicationContext(AppModule, {
          logger: false,
        });

        const registry = app.get(ExpositionRegistry, { strict: false });
        const action = registry.get(actionName);

        if (!action) {
          console.error(pc.red(`no action named "${actionName}"`));
          await app.close();
          process.exitCode = 1;
          return;
        }

        const params = Object.fromEntries(
          action.params.flatMap((param) => {
            const raw = options.param[param.name];
            return raw === undefined
              ? []
              : [[param.name, coerceCliValue(param.spec, raw)]];
          }),
        );

        const runner = app.get(ExpositionRunner, { strict: false });

        try {
          const result = await TenantContextStorage.run(
            { tenantId: options.tenant, userId: null, impersonatedBy: null },
            async () => await runner.runTrusted(actionName, params),
          );
          console.log(JSON.stringify(result, null, 2));
        } finally {
          await app.close();
        }
      },
    );
}
