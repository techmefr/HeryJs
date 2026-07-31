import { NestFactory } from '@nestjs/core';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import type { Command } from 'commander';
import pc from 'picocolors';
import { AppModule } from '#app.module';
import { heryConfig } from '#technical/config/hery-config';
import { env } from '#technical/config/env';
import { searchDriverToken } from '#technical/search/search-driver';
import type { SearchDriver } from '#technical/search/search-driver';
import { camelCase, kebabCase } from '../lib/naming';

const BUILTIN_DRIVER = 'prisma';

const RESERVED_FIELDS = new Set([
  'id',
  'tenantId',
  'ownerId',
  'teamId',
  'createdAt',
  'updatedAt',
  'deletedAt',
]);

const PAGE_SIZE = 200;

interface ScopedRecord {
  id: string;
  tenantId: string;
  deletedAt: Date | null;
  [key: string]: unknown;
}

export function registerSearchReindexCommand(program: Command): void {
  program
    .command('search:reindex <model>')
    .description(
      'Backfill a search engine index from the database for one resource, e.g. after installing search-elasticsearch/search-meilisearch on data created before it',
    )
    .action(async (model: string) => {
      const app = await NestFactory.createApplicationContext(AppModule, {
        logger: false,
      });

      // Resolved straight off hery.config.ts's declared engines rather than
      // through SearchEngineRegistry, which only exists in the container if
      // the project has at least one generated resource wired to SearchModule
      // -- this command has to work even when reindexing a hand-added Prisma
      // model that was never run through hery generate. Each declared engine
      // is looked up by its own token; nothing provides a given token at all
      // when its module is not installed, so absence has to be caught rather
      // than checked for a falsy return.
      const engines = heryConfig.search?.engines ?? {};
      const drivers = new Set<SearchDriver>();

      for (const engine of Object.values(engines)) {
        if (engine.driver === BUILTIN_DRIVER) {
          continue;
        }

        try {
          drivers.add(
            app.get<SearchDriver>(searchDriverToken(engine.driver), {
              strict: false,
            }),
          );
        } catch {
          continue;
        }
      }

      if (drivers.size === 0) {
        console.log(
          pc.yellow('No search engine installed -- nothing to reindex.'),
        );
        await app.close();
        return;
      }

      const modelInfo = Prisma.dmmf.datamodel.models.find(
        (candidate) => candidate.name === model,
      );

      if (!modelInfo) {
        console.log(pc.red(`No Prisma model named "${model}"`));
        await app.close();
        process.exitCode = 1;
        return;
      }

      const searchableFields = modelInfo.fields
        .filter(
          (field) =>
            field.kind === 'scalar' &&
            field.type === 'String' &&
            !RESERVED_FIELDS.has(field.name),
        )
        .map((field) => field.name);
      const hasSoftDelete = modelInfo.fields.some(
        (field) => field.name === 'deletedAt',
      );

      const collection = kebabCase(model);
      const delegateName = camelCase(model);

      // A backfill has no single request's tenant to scope by -- it needs
      // every tenant's rows -- so it bypasses the tenant-scoped Prisma client
      // entirely, the same way prisma/seed.ts does.
      const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
      const rawClient = new PrismaClient({ adapter });
      const delegate = (
        rawClient as unknown as Record<
          string,
          {
            findMany(args: {
              take: number;
              skip: number;
              orderBy: { id: 'asc' };
            }): Promise<ScopedRecord[]>;
          }
        >
      )[delegateName];

      if (!delegate) {
        console.log(pc.red(`No Prisma delegate for model "${model}"`));
        await rawClient.$disconnect();
        await app.close();
        process.exitCode = 1;
        return;
      }

      let indexed = 0;
      let removed = 0;
      let skip = 0;

      for (;;) {
        const page = await delegate.findMany({
          take: PAGE_SIZE,
          skip,
          orderBy: { id: 'asc' },
        });

        if (page.length === 0) {
          break;
        }

        for (const record of page) {
          if (hasSoftDelete && record.deletedAt) {
            for (const driver of drivers) {
              await driver.remove(collection, record.id, record.tenantId);
            }
            removed += 1;
            continue;
          }

          const document = Object.fromEntries(
            searchableFields.map((field) => [field, record[field]]),
          );
          for (const driver of drivers) {
            await driver.index(
              collection,
              record.id,
              document,
              record.tenantId,
            );
          }
          indexed += 1;
        }

        skip += PAGE_SIZE;
      }

      console.log(
        pc.green(
          `✔ reindexed ${collection}: ${indexed} indexed, ${removed} removed`,
        ),
      );

      await rawClient.$disconnect();
      await app.close();
    });
}
