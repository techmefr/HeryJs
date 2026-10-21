import { NestFactory } from '@nestjs/core';
import type { Command } from 'commander';
import pc from 'picocolors';
import { loadBlueprint, resolveBlueprintPath } from '../lib/blueprint';
import { buildResourceContext } from '../lib/resource-context';
import { vectorTargetOf } from '../lib/vector-target';

export function registerEmbeddingsBackfillCommand(program: Command): void {
  program
    .command('embeddings:backfill <name>')
    .description(
      'Embed the rows of a resource that have a source text and no vector yet, e.g. rows written before its vector field existed. Safe to rerun: only rows still missing a vector are touched',
    )
    .option(
      '--dry-run',
      'count the rows that would be embedded, change nothing',
    )
    .option('--tenant <id>', 'only this tenant instead of every tenant')
    .option('--batch <size>', 'rows read per query', '100')
    .action(
      async (
        name: string,
        options: { dryRun?: boolean; tenant?: string; batch: string },
      ) => {
        const blueprint = loadBlueprint(
          resolveBlueprintPath(process.cwd(), name),
        );
        const target = vectorTargetOf(buildResourceContext(blueprint));
        const batchSize = Number.parseInt(options.batch, 10);

        if (!target) {
          console.error(pc.red(`${name} declares no vector field.`));
          process.exitCode = 1;
          return;
        }

        if (!Number.isInteger(batchSize) || batchSize < 1) {
          console.error(pc.red('--batch must be a positive integer.'));
          process.exitCode = 1;
          return;
        }

        const { AppModule } = await import('#app.module');
        const { VectorBackfill } =
          await import('#technical/vector/vector-backfill');
        const { VectorIndexer } =
          await import('#technical/vector/vector-indexer');
        const { VectorStore } = await import('#technical/vector/vector-store');

        const app = await NestFactory.createApplicationContext(AppModule, {
          logger: false,
        });

        try {
          const backfill = new VectorBackfill(
            app.get(VectorStore, { strict: false }),
            app.get(VectorIndexer, { strict: false }),
          );
          const report = await backfill.run(target, {
            tenantId: options.tenant,
            batchSize,
            isDryRun: options.dryRun === true,
          });

          console.log(
            options.dryRun
              ? pc.cyan(
                  `${report.missing} row(s) of ${name} across ${report.tenants} tenant(s) would be embedded.`,
                )
              : pc.green(
                  `Embedded ${report.embedded} of ${report.missing} row(s) of ${name} across ${report.tenants} tenant(s).`,
                ),
          );

          for (const failure of report.failed) {
            console.error(
              pc.red(`  ${failure.tenantId}/${failure.id}: ${failure.reason}`),
            );
          }

          if (report.failed.length > 0) {
            process.exitCode = 1;
          }
        } finally {
          await app.close();
        }
      },
    );
}
