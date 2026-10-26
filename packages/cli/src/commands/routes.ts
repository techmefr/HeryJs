import { projectAppModule } from '../lib/project-module';
import { NestFactory } from '@nestjs/core';
import type { Command } from 'commander';
import pc from 'picocolors';
import {
  formatRouteTable,
  routeRows,
  sortRows,
  unguardedRows,
} from '../lib/routes-table';

export function registerRoutesCommand(program: Command): void {
  program
    .command('routes')
    .description(
      'List every route with its method, path, capability and rate-limit bucket',
    )
    .option('--unguarded', 'Only routes missing a capability or a rate limit')
    .option('--json', 'Print the rows as JSON')
    .action(async (options: { unguarded?: boolean; json?: boolean }) => {
      const AppModule = projectAppModule();
      const { IntrospectionService } =
        await import('@heryjs/core/technical/introspection/introspection.service');

      const app = await NestFactory.createApplicationContext(AppModule, {
        logger: false,
      });

      try {
        const all = sortRows(
          routeRows(app.get(IntrospectionService, { strict: false }).all()),
        );
        const rows = options.unguarded ? unguardedRows(all) : all;

        if (options.json) {
          console.log(JSON.stringify(rows, null, 2));
          return;
        }

        if (rows.length === 0) {
          console.log(
            pc.green('Every route carries a capability and a rate limit.'),
          );
          return;
        }

        console.log(formatRouteTable(rows));
        console.log(pc.dim(`\n${rows.length} route(s)`));
      } finally {
        await app.close();
      }
    });
}
