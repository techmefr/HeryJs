import { Injectable } from '@nestjs/common';
import { Client } from '@elastic/elasticsearch';
import { elasticsearchEnv } from './elasticsearch-search.env';
import { matchesFrom } from '#kernel/search/search-driver';
import type { SearchDriver, SearchMatches } from '#kernel/search/search-driver';

const TENANT_FIELD = 'tenantId';

@Injectable()
export class ElasticsearchSearchDriver implements SearchDriver {
  private readonly client = new Client({
    node: elasticsearchEnv.ELASTICSEARCH_URL,
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
    // Deletion is by id alone -- a Prisma cuid is already globally unique, so
    // there is no ambiguity a tenant filter would resolve here. tenantId is
    // part of the shared SearchDriver contract for consistency with
    // index()/search(), not because this call needs it.
    await this.client.delete({ index: collection, id }, { ignore: [404] });
  }

  // The tenant filter travels inside the query itself, not as a client-side
  // pass over the results: a top-N search that only learns about tenants
  // after the fact can fill its whole page with another tenant's matches,
  // leaving the caller with fewer hits than actually exist for them -- or
  // none at all -- with no error anywhere.
  //
  // size is passed explicitly because Elasticsearch answers with its first 10
  // hits otherwise -- a cap the caller never chose and could not see.
  async search(
    collection: string,
    term: string,
    fields: readonly string[],
    tenantId: string,
    limit: number,
  ): Promise<SearchMatches> {
    const result = await this.client.search({
      index: collection,
      size: limit + 1,
      query: {
        bool: {
          must: { multi_match: { query: term, fields: [...fields] } },
          filter: { term: { [TENANT_FIELD]: tenantId } },
        },
      },
    });

    return matchesFrom(
      result.hits.hits.map((hit) => hit._id as string),
      limit,
    );
  }
}
