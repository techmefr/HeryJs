import { Injectable } from '@nestjs/common';
import { Client } from '@elastic/elasticsearch';
import { elasticsearchEnv } from './elasticsearch-search.env';
import { matchesFrom } from '#kernel/search/search-driver';
import type { SearchDriver, SearchMatches } from '#kernel/search/search-driver';

const TENANT_FIELD = 'tenantId';

function isAlreadyExists(error: unknown): boolean {
  return (
    (error as { body?: { error?: { type?: string } } })?.body?.error?.type ===
    'resource_already_exists_exception'
  );
}

@Injectable()
export class ElasticsearchSearchDriver implements SearchDriver {
  private readonly client = new Client({
    node: elasticsearchEnv.ELASTICSEARCH_URL,
  });

  /**
   * Left to its own dynamic mapping, Elasticsearch types a first-seen string
   * as `text` with a `.keyword` sub-field, and a `term` filter on an analysed
   * `text` field matches nothing -- so every search answered with zero hits
   * while the documents sat in the index, tenant isolation holding only
   * because nobody could read anything at all. The tenant field is declared
   * `keyword` before the first document lands instead, which is what it is:
   * an identifier to match exactly, never a phrase to analyse.
   *
   * A collection created by an earlier version of this driver keeps the
   * mapping it was born with -- Elasticsearch cannot retype a live field --
   * and has to be reindexed to pick this up.
   */
  private readonly mappedCollections = new Set<string>();

  private async ensureMapping(collection: string): Promise<void> {
    if (this.mappedCollections.has(collection)) {
      return;
    }

    if (!(await this.client.indices.exists({ index: collection }))) {
      try {
        await this.client.indices.create({
          index: collection,
          mappings: { properties: { [TENANT_FIELD]: { type: 'keyword' } } },
        });
      } catch (error) {
        // Two processes reaching a fresh collection at once both see it
        // missing, and the loser of that race is told it already exists --
        // which is the state it was asking for. Anything else is a real
        // failure and stays one.
        if (!isAlreadyExists(error)) {
          throw error;
        }
      }
    }

    this.mappedCollections.add(collection);
  }

  async index(
    collection: string,
    id: string,
    document: Record<string, unknown>,
    tenantId: string,
  ): Promise<void> {
    await this.ensureMapping(collection);
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
