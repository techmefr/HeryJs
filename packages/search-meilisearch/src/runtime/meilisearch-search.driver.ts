import { Injectable } from '@nestjs/common';
import { Meilisearch } from 'meilisearch';
import { matchesFrom } from '#kernel/search/search-driver';
import type { SearchDriver, SearchMatches } from '#kernel/search/search-driver';

const TENANT_FIELD = 'tenantId';

@Injectable()
export class MeilisearchSearchDriver implements SearchDriver {
  private readonly client = new Meilisearch({
    host: process.env.MEILISEARCH_URL ?? 'http://localhost:7700',
    apiKey: process.env.MEILISEARCH_API_KEY ?? 'heryjs-dev-master-key',
  });

  // Meilisearch refuses to filter on an attribute that was never declared
  // filterable, so this has to run at least once per collection before the
  // first search -- tracked per process rather than reissued on every index()
  // call, since it is itself an indexing operation.
  private readonly filterableConfigured = new Set<string>();

  private async ensureFilterable(collection: string): Promise<void> {
    if (this.filterableConfigured.has(collection)) {
      return;
    }

    await this.client
      .index(collection)
      .updateFilterableAttributes([TENANT_FIELD]);
    this.filterableConfigured.add(collection);
  }

  async index(
    collection: string,
    id: string,
    document: Record<string, unknown>,
    tenantId: string,
  ): Promise<void> {
    await this.ensureFilterable(collection);
    await this.client
      .index(collection)
      .addDocuments([{ id, ...document, [TENANT_FIELD]: tenantId }]);
  }

  async remove(collection: string, id: string): Promise<void> {
    // Deletion is by id alone -- a Prisma cuid is already globally unique, so
    // there is no ambiguity a tenant filter would resolve here. tenantId is
    // part of the shared SearchDriver contract for consistency with
    // index()/search(), not because this call needs it.
    await this.client.index(collection).deleteDocument(id);
  }

  // The tenant filter travels inside the query itself, not as a client-side
  // pass over the results: a top-N search that only learns about tenants
  // after the fact can fill its whole page with another tenant's matches,
  // leaving the caller with fewer hits than actually exist for them -- or
  // none at all -- with no error anywhere.
  //
  // limit is passed explicitly because Meilisearch answers with its first 20
  // hits otherwise -- a cap the caller never chose and could not see.
  async search(
    collection: string,
    term: string,
    fields: readonly string[],
    tenantId: string,
    limit: number,
  ): Promise<SearchMatches> {
    await this.ensureFilterable(collection);
    const result = await this.client.index(collection).search(term, {
      attributesToSearchOn: [...fields],
      filter: `${TENANT_FIELD} = ${JSON.stringify(tenantId)}`,
      limit: limit + 1,
    });

    return matchesFrom(
      result.hits.map((hit) => (hit as unknown as { id: string }).id),
      limit,
    );
  }
}
