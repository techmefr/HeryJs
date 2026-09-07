import { Injectable } from '@nestjs/common';
import { Meilisearch } from 'meilisearch';
import type { EnqueuedTask } from 'meilisearch';
import { meilisearchEnv } from './meilisearch-search.env';
import { MeilisearchTaskFailedException } from './meilisearch-task-failed.exception';
import { matchesFrom } from '#kernel/search/search-driver';
import type { SearchDriver, SearchMatches } from '#kernel/search/search-driver';

const TENANT_FIELD = 'tenantId';
const PRIMARY_KEY = 'id';

@Injectable()
export class MeilisearchSearchDriver implements SearchDriver {
  private readonly client = new Meilisearch({
    host: meilisearchEnv.MEILISEARCH_URL,
    apiKey: meilisearchEnv.MEILISEARCH_API_KEY,
  });

  // Meilisearch refuses to filter on an attribute that was never declared
  // filterable, so this has to run at least once per collection before the
  // first search -- tracked per process rather than reissued on every index()
  // call, since it is itself an indexing operation.
  private readonly filterableConfigured = new Set<string>();

  /**
   * Every write here is asynchronous on Meilisearch's side: the call returns a
   * task id, and the task can still fail afterwards. Left unread, that answer
   * turned a rejected write into a success -- documents carrying both `id` and
   * `tenantId` made primary-key inference ambiguous, every indexing task
   * failed, index() reported nothing, and searches came back empty forever.
   * The task is therefore awaited and its verdict raised.
   */
  private async settle(
    task: EnqueuedTask,
    operation: string,
    collection: string,
  ): Promise<void> {
    const finished = await this.client.tasks.waitForTask(task.taskUid);

    if (finished.status !== 'succeeded') {
      throw new MeilisearchTaskFailedException(
        operation,
        collection,
        finished.error?.message ?? `the task ended as ${finished.status}`,
      );
    }
  }

  private async ensureFilterable(collection: string): Promise<void> {
    if (this.filterableConfigured.has(collection)) {
      return;
    }

    await this.settle(
      await this.client
        .index(collection)
        .updateFilterableAttributes([TENANT_FIELD]),
      'declare tenantId filterable',
      collection,
    );
    this.filterableConfigured.add(collection);
  }

  // The primary key is named rather than inferred: a document carrying both
  // `id` and `tenantId` gives Meilisearch two candidates ending in "id", and
  // it declines to pick one.
  async index(
    collection: string,
    id: string,
    document: Record<string, unknown>,
    tenantId: string,
  ): Promise<void> {
    await this.ensureFilterable(collection);
    await this.settle(
      await this.client
        .index(collection)
        .addDocuments([{ id, ...document, [TENANT_FIELD]: tenantId }], {
          primaryKey: PRIMARY_KEY,
        }),
      'index a document',
      collection,
    );
  }

  async remove(collection: string, id: string): Promise<void> {
    // Deletion is by id alone -- a Prisma cuid is already globally unique, so
    // there is no ambiguity a tenant filter would resolve here. tenantId is
    // part of the shared SearchDriver contract for consistency with
    // index()/search(), not because this call needs it.
    await this.settle(
      await this.client.index(collection).deleteDocument(id),
      'remove a document',
      collection,
    );
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
