import { devOnlyDefault, parseModuleEnv } from '#kernel/public/config';

export const elasticsearchEnv = parseModuleEnv('search-elasticsearch', {
  ELASTICSEARCH_URL: devOnlyDefault(
    'ELASTICSEARCH_URL',
    'http://localhost:9200',
  ),
});
