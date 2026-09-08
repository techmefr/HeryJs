import { MeilisearchSearchDriver } from './meilisearch-search.driver';
import { MeilisearchTaskFailedException } from './meilisearch-task-failed.exception';

interface FakeIndex {
  updateFilterableAttributes: jest.Mock;
  addDocuments: jest.Mock;
  deleteDocument: jest.Mock;
  search: jest.Mock;
}

interface FakeClient {
  index: jest.Mock;
  tasks: { waitForTask: jest.Mock };
  theIndex: FakeIndex;
}

function fakeClient(hitIds: string[] = []): FakeClient {
  const theIndex: FakeIndex = {
    updateFilterableAttributes: jest.fn().mockResolvedValue({ taskUid: 1 }),
    addDocuments: jest.fn().mockResolvedValue({ taskUid: 2 }),
    deleteDocument: jest.fn().mockResolvedValue({ taskUid: 3 }),
    search: jest.fn().mockResolvedValue({ hits: hitIds.map((id) => ({ id })) }),
  };

  return {
    theIndex,
    index: jest.fn().mockReturnValue(theIndex),
    tasks: {
      waitForTask: jest.fn().mockResolvedValue({ status: 'succeeded' }),
    },
  };
}

/**
 * Built without running the constructor: the real one opens a client against
 * MEILISEARCH_URL, and nothing asserted here needs an engine. What it does
 * need is the query and the task handling, which is where both of this
 * driver's real failures lived.
 */
function driverWith(client: FakeClient): MeilisearchSearchDriver {
  return Object.assign(
    Object.create(MeilisearchSearchDriver.prototype) as MeilisearchSearchDriver,
    { client, filterableConfigured: new Set<string>() },
  );
}

describe('the Meilisearch driver', () => {
  it('filters by tenant inside the query', async () => {
    const client = fakeClient();

    await driverWith(client).search(
      'blog_posts',
      'hello',
      ['title'],
      'acme',
      10,
    );

    expect(client.theIndex.search).toHaveBeenCalledWith(
      'hello',
      expect.objectContaining({
        attributesToSearchOn: ['title'],
        filter: 'tenantId = "acme"',
      }),
    );
  });

  // The tenant id ends up inside a filter expression, so it is quoted rather
  // than interpolated raw.
  it('quotes a tenant id that would otherwise break the filter', async () => {
    const client = fakeClient();

    await driverWith(client).search(
      'blog_posts',
      'hello',
      [],
      'a "quoted" one',
      10,
    );

    expect(client.theIndex.search).toHaveBeenCalledWith(
      'hello',
      expect.objectContaining({ filter: 'tenantId = "a \\"quoted\\" one"' }),
    );
  });

  // Meilisearch answers with its first 20 hits when no limit is given, a cap
  // the caller never chose. One over is what lets the kernel report the cut.
  it('asks for one more hit than the limit', async () => {
    const client = fakeClient();

    await driverWith(client).search('blog_posts', 'hello', [], 'acme', 3);

    expect(client.theIndex.search).toHaveBeenCalledWith(
      'hello',
      expect.objectContaining({ limit: 4 }),
    );
  });

  it('reports the result set as truncated when there is one more', async () => {
    const matches = await driverWith(fakeClient(['a', 'b', 'c', 'd'])).search(
      'blog_posts',
      'hello',
      [],
      'acme',
      3,
    );

    expect(matches).toEqual({
      ids: ['a', 'b', 'c'],
      truncated: true,
      limit: 3,
    });
  });

  // Meilisearch refuses to filter on an attribute never declared filterable,
  // so this has to run before the first search rather than after it.
  it('declares the tenant field filterable before searching', async () => {
    const client = fakeClient();

    await driverWith(client).search('blog_posts', 'hello', [], 'acme', 10);

    expect(client.theIndex.updateFilterableAttributes).toHaveBeenCalledWith([
      'tenantId',
    ]);
  });

  it('declares it once per collection', async () => {
    const client = fakeClient();
    const driver = driverWith(client);

    await driver.search('blog_posts', 'hello', [], 'acme', 10);
    await driver.search('blog_posts', 'again', [], 'acme', 10);

    expect(client.theIndex.updateFilterableAttributes).toHaveBeenCalledTimes(1);
  });

  /**
   * The primary key is named rather than inferred: a document carrying both
   * `id` and `tenantId` gave Meilisearch two candidates ending in "id", it
   * declined to pick one, and every indexing task failed while index()
   * reported nothing -- searches then came back empty forever.
   */
  it('names the primary key and stamps the tenant', async () => {
    const client = fakeClient();

    await driverWith(client).index(
      'blog_posts',
      'post-1',
      { title: 'Hello' },
      'acme',
    );

    expect(client.theIndex.addDocuments).toHaveBeenCalledWith(
      [{ id: 'post-1', title: 'Hello', tenantId: 'acme' }],
      { primaryKey: 'id' },
    );
  });

  // Every write is asynchronous on Meilisearch's side: the call returns a task
  // id, and the task can still fail afterwards. Left unread, that answer turned
  // a rejected write into a success.
  it('raises a task that ends in failure', async () => {
    const client = fakeClient();
    client.tasks.waitForTask.mockResolvedValue({
      status: 'failed',
      error: { message: 'primary key inference failed' },
    });

    await expect(
      driverWith(client).index('blog_posts', 'post-1', {}, 'acme'),
    ).rejects.toThrow(MeilisearchTaskFailedException);
  });

  it('names the operation and the collection when a task fails', async () => {
    const client = fakeClient();
    client.tasks.waitForTask.mockResolvedValue({
      status: 'failed',
      error: { message: 'disk full' },
    });

    await expect(
      driverWith(client).index('blog_posts', 'post-1', {}, 'acme'),
    ).rejects.toThrow(/blog_posts.*disk full/);
  });

  it('reports a status it has no error message for', async () => {
    const client = fakeClient();
    client.tasks.waitForTask.mockResolvedValue({ status: 'canceled' });

    await expect(
      driverWith(client).index('blog_posts', 'post-1', {}, 'acme'),
    ).rejects.toThrow(/canceled/);
  });

  it('waits for the deletion task too', async () => {
    const client = fakeClient();

    await driverWith(client).remove('blog_posts', 'post-1');

    expect(client.theIndex.deleteDocument).toHaveBeenCalledWith('post-1');
    expect(client.tasks.waitForTask).toHaveBeenCalledWith(3);
  });
});
