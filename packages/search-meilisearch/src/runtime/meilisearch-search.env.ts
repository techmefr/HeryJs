import { devOnlyDefault, parseModuleEnv } from '#kernel/config/module-env';

export const meilisearchEnv = parseModuleEnv('search-meilisearch', {
  MEILISEARCH_URL: devOnlyDefault('MEILISEARCH_URL', 'http://localhost:7700'),
  MEILISEARCH_API_KEY: devOnlyDefault(
    'MEILISEARCH_API_KEY',
    'heryjs-dev-master-key',
  ),
});
