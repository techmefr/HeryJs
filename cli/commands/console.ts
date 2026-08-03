import * as repl from 'node:repl';
import { NestFactory } from '@nestjs/core';
import type { Command } from 'commander';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';

/**
 * The application module and the Prisma client are loaded inside the action,
 * not imported at the top, because both reach `env.ts` -- which parses
 * process.env in its module body and throws when it does not validate. A
 * static import here runs when `hery.ts` registers its commands, so an invalid
 * environment would take down every other command too: `hery doctor` could
 * never report the problem it exists to report.
 */
export function registerConsoleCommand(program: Command): void {
  program
    .command('console')
    .description(
      'Boot the application and drop into a REPL with the DI container and the Prisma client',
    )
    .option('--tenant <tenantId>', 'tenant id to scope queries to', 'default')
    .action(async (options: { tenant: string }) => {
      const { AppModule } = await import('#app.module');
      const { PRISMA_CLIENT } = await import('#technical/prisma/prisma.client');

      const app = await NestFactory.createApplicationContext(AppModule, {
        logger: false,
      });

      TenantContextStorage.run({ tenantId: options.tenant }, () => {
        const session = repl.start({ prompt: 'hery> ' });

        const context = session.context as Record<string, unknown>;
        context.app = app;
        context.prisma = app.get(PRISMA_CLIENT);
        context.get = (token: unknown): unknown => app.get(token as never);

        session.on('exit', () => {
          void app.close().then(() => process.exit(0));
        });
      });
    });
}
