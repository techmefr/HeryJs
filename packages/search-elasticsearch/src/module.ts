import pc from 'picocolors';
import { defineModule } from '../../../cli/lib/module-definition';

export default defineModule({
  name: 'search-elasticsearch',
  description:
    'Swap free-text search from Prisma contains() to Elasticsearch (docker service, driver, DI wiring)',
  meta: { compatibility: '>=0.0.1' },
  dest: 'src/technical/search',
  dependencies: ['@elastic/elasticsearch@^9.5.1'],
  install(context) {
    context.copyPackageFile('docker-compose.search-elasticsearch.yml');
    context.copyRuntime();

    context.nextSteps([
      `Import ${pc.bold('ElasticsearchSearchModule')} into src/app.module.ts`,
      "Declare it in hery.config.ts, e.g. { search: { default: 'prisma', engines: { prisma: { driver: 'prisma' }, elasticsearch: { driver: 'elasticsearch' } } } }",
      'Run "pnpm hery up --start" to boot Elasticsearch and resolve ELASTICSEARCH_URL',
    ]);
  },
});
