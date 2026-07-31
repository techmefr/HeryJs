import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import pc from 'picocolors';
import { registerModule } from '../../../cli/lib/module-registry';
import { copyRuntime } from '../../../cli/lib/runtime-copy';

const COMPOSE_FILE = 'docker-compose.search-meilisearch.yml';
const RUNTIME_DIR = path.join(__dirname, 'runtime');
const DEST_DIR = 'src/technical/search';

registerModule({
  name: 'search-meilisearch',
  description:
    'Swap free-text search from Prisma contains() to Meilisearch (docker service, driver, DI wiring)',
  dependencies: ['meilisearch'],
  install() {
    if (existsSync(COMPOSE_FILE)) {
      console.log(pc.yellow(`${COMPOSE_FILE} already exists, skipping.`));
    } else {
      writeFileSync(
        COMPOSE_FILE,
        readFileSync(path.join(__dirname, '..', COMPOSE_FILE), 'utf8'),
      );
      console.log(pc.green(`✔ ${COMPOSE_FILE}`));
    }

    copyRuntime(RUNTIME_DIR, DEST_DIR);

    console.log('');
    console.log(pc.cyan('Next steps:'));
    console.log(
      `  1. Import ${pc.bold('MeilisearchSearchModule')} into src/app.module.ts`,
    );
    console.log(
      `  2. Declare it in hery.config.ts, e.g. { search: { default: 'prisma', engines: { prisma: { driver: 'prisma' }, meilisearch: { driver: 'meilisearch' } } } }`,
    );
    console.log(
      `  3. Run "pnpm hery up --start" to boot Meilisearch and resolve MEILISEARCH_URL`,
    );
  },
});
