import { Injectable } from '@nestjs/common';
import { Client } from '@elastic/elasticsearch';
import type { SearchDriver } from '#kernel/search/search-driver';

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
    await this.client.delete({ index: collection, id }, { ignore: [404] });
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
