import { Injectable } from '@nestjs/common';
import { Client } from '@elastic/elasticsearch';
import type { SearchDriver } from '#kernel/search/search-driver';

const TENANT_FIELD = 'tenantId';

@Injectable()
export class ElasticsearchSearchDriver implements SearchDriver {
  private readonly client = new Client({
    node: process.env.ELASTICSEARCH_URL ?? 'http://localhost:9200',
  });

  async index(
    collection: string,
    id: string,
    document: Record<string, unknown>,
    tenantId: string,
  ): Promise<void> {
    await this.client.index({
      index: collection,
      id,
      document: { ...document, [TENANT_FIELD]: tenantId },
    });
  }

  async remove(collection: string, id: string): Promise<void> {
    await this.client.delete({ index: collection, id }, { ignore: [404] });
  }

  // The tenant filter travels inside the query itself, not as a client-side
  // pass over the results: a top-N search that only learns about tenants
  // after the fact can fill its whole page with another tenant's matches,
  // leaving the caller with fewer hits than actually exist for them -- or
  // none at all -- with no error anywhere.
  async search(
    collection: string,
    term: string,
    fields: readonly string[],
    tenantId: string,
  ): Promise<string[]> {
    const result = await this.client.search({
      index: collection,
      query: {
        bool: {
          must: { multi_match: { query: term, fields: [...fields] } },
          filter: { term: { [TENANT_FIELD]: tenantId } },
        },
      },
    });

    return result.hits.hits.map((hit) => hit._id as string);
  }
}
