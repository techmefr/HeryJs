import type { ModuleDefinition } from 'heryjs';

export default {
  name: 'search-meilisearch',
  description:
    'Swap free-text search from Prisma contains() to Meilisearch (docker service, driver, DI wiring)',
  meta: { compatibility: '>=0.0.1' },
  dest: 'src/technical/search',
  dependencies: ['meilisearch'],
  install(context) {
    context.copyPackageFile('docker-compose.search-meilisearch.yml');
    context.copyRuntime();

    context.nextSteps([
      `Import "MeilisearchSearchModule" into src/app.module.ts`,
      "Declare it in hery.config.ts, e.g. { search: { default: 'prisma', engines: { prisma: { driver: 'prisma' }, meilisearch: { driver: 'meilisearch' } } } }",
      'Run "pnpm hery up --start" to boot Meilisearch and resolve MEILISEARCH_URL',
    ]);
  },
} satisfies ModuleDefinition;
