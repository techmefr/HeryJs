import { existsSync, writeFileSync } from 'node:fs';
import pc from 'picocolors';
import { registerModule } from '../lib/module-registry';

const COMPOSE_FILE = 'docker-compose.search-meilisearch.yml';
const DRIVER_FILE = 'src/technical/search/meilisearch-search.driver.ts';
const MODULE_FILE = 'src/technical/search/meilisearch-search.module.ts';

const COMPOSE_CONTENT = `services:
  meilisearch:
    image: getmeili/meilisearch:v1.11
    restart: unless-stopped
    environment:
      MEILI_MASTER_KEY: heryjs-dev-master-key
      MEILI_NO_ANALYTICS: 'true'
    ports:
      - '7700'
    volumes:
      - heryjs-meilisearch:/meili_data

volumes:
  heryjs-meilisearch:
`;

const DRIVER_CONTENT = `import { Injectable } from '@nestjs/common';
import { Meilisearch } from 'meilisearch';
import type { SearchDriver } from './search-driver';

@Injectable()
export class MeilisearchSearchDriver implements SearchDriver {
  private readonly client = new Meilisearch({
    host: process.env.MEILISEARCH_URL ?? 'http://localhost:7700',
    apiKey: process.env.MEILISEARCH_API_KEY ?? 'heryjs-dev-master-key',
  });

  async index(
    collection: string,
    id: string,
    document: Record<string, unknown>,
  ): Promise<void> {
    await this.client.index(collection).addDocuments([{ id, ...document }]);
  }

  async remove(collection: string, id: string): Promise<void> {
    await this.client.index(collection).deleteDocument(id);
  }

  async search(
    collection: string,
    term: string,
    fields: readonly string[],
  ): Promise<string[]> {
    const result = await this.client
      .index(collection)
      .search(term, { attributesToSearchOn: [...fields] });

    return result.hits.map((hit) => (hit as unknown as { id: string }).id);
  }
}
`;

const MODULE_CONTENT = `import { Global, Module } from '@nestjs/common';
import { SEARCH_DRIVER } from './search-driver';
import { MeilisearchSearchDriver } from './meilisearch-search.driver';

@Global()
@Module({
  providers: [
    MeilisearchSearchDriver,
    { provide: SEARCH_DRIVER, useExisting: MeilisearchSearchDriver },
  ],
  exports: [SEARCH_DRIVER],
})
export class MeilisearchSearchModule {}
`;

registerModule({
  name: 'search-meilisearch',
  description:
    'Swap free-text search from Prisma contains() to Meilisearch (docker service, driver, DI wiring)',
  dependencies: ['meilisearch'],
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
      `  1. Import ${pc.bold('MeilisearchSearchModule')} into src/app.module.ts`,
    );
    console.log(
      `  2. Run "pnpm hery up --start" to boot Meilisearch and resolve MEILISEARCH_URL`,
    );
  },
});
