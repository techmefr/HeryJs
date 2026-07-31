import { Injectable } from '@nestjs/common';
import { Meilisearch } from 'meilisearch';
import type { SearchDriver } from '#kernel/search/search-driver';

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
