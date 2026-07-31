import * as repl from 'node:repl';
import { NestFactory } from '@nestjs/core';
import type { Command } from 'commander';
import { AppModule } from '#app.module';
import { PRISMA_CLIENT } from '#technical/prisma/prisma.client';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';

export function registerConsoleCommand(program: Command): void {
  program
    .command('console')
    .description(
      'Boot the application and drop into a REPL with the DI container and the Prisma client',
    )
    .option('--tenant <tenantId>', 'tenant id to scope queries to', 'default')
    .action(async (options: { tenant: string }) => {
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
