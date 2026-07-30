import { existsSync, writeFileSync } from 'node:fs';
import pc from 'picocolors';
import { registerModule } from '../lib/module-registry';

const COMPOSE_FILE = 'docker-compose.search-elasticsearch.yml';
const DRIVER_FILE = 'src/technical/search/elasticsearch-search.driver.ts';
const MODULE_FILE = 'src/technical/search/elasticsearch-search.module.ts';

const COMPOSE_CONTENT = `services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.17.0
    restart: unless-stopped
    environment:
      discovery.type: single-node
      xpack.security.enabled: 'false'
      ES_JAVA_OPTS: '-Xms512m -Xmx512m'
    ports:
      - '9200'
    volumes:
      - heryjs-elasticsearch:/usr/share/elasticsearch/data

volumes:
  heryjs-elasticsearch:
`;

const DRIVER_CONTENT = `import { Injectable } from '@nestjs/common';
import { Client } from '@elastic/elasticsearch';
import type { SearchDriver } from './search-driver';

@Injectable()
export class ElasticsearchSearchDriver implements SearchDriver {
  private readonly client = new Client({
    node: process.env.ELASTICSEARCH_URL ?? 'http://localhost:9200',
  });

  async index(
    collection: string,
    id: string,
    document: Record<string, unknown>,
  ): Promise<void> {
    await this.client.index({ index: collection, id, document });
  }

  async remove(collection: string, id: string): Promise<void> {
    await this.client.delete(
      { index: collection, id },
      { ignore: [404] },
    );
  }

  async search(
    collection: string,
    term: string,
    fields: readonly string[],
  ): Promise<string[]> {
    const result = await this.client.search({
      index: collection,
      query: { multi_match: { query: term, fields: [...fields] } },
    });

    return result.hits.hits.map((hit) => hit._id as string);
  }
}
`;

const MODULE_CONTENT = `import { Global, Module } from '@nestjs/common';
import { SEARCH_DRIVER } from './search-driver';
import { ElasticsearchSearchDriver } from './elasticsearch-search.driver';

@Global()
@Module({
  providers: [
    ElasticsearchSearchDriver,
    { provide: SEARCH_DRIVER, useExisting: ElasticsearchSearchDriver },
  ],
  exports: [SEARCH_DRIVER],
})
export class ElasticsearchSearchModule {}
`;

registerModule({
  name: 'search-elasticsearch',
  description:
    'Swap free-text search from Prisma contains() to Elasticsearch (docker service, driver, DI wiring)',
  dependencies: ['@elastic/elasticsearch@^8.17.0'],
  install() {
    const files: Record<string, string> = {
      [COMPOSE_FILE]: COMPOSE_CONTENT,
      [DRIVER_FILE]: DRIVER_CONTENT,
      [MODULE_FILE]: MODULE_CONTENT,
    };

    for (const [filePath, content] of Object.entries(files)) {
      if (existsSync(filePath)) {
        console.log(pc.yellow(`${filePath} already exists, skipping.`));
        continue;
      }

      writeFileSync(filePath, content);
      console.log(pc.green(`✔ ${filePath}`));
    }

    console.log('');
    console.log(pc.cyan('Next steps:'));
    console.log(
      `  1. Import ${pc.bold('ElasticsearchSearchModule')} into src/app.module.ts`,
    );
    console.log(
      `  2. Run "pnpm hery up --start" to boot Elasticsearch and resolve ELASTICSEARCH_URL`,
    );
  },
});
