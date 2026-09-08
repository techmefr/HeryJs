import { ElasticsearchSearchDriver } from './elasticsearch-search.driver';

interface FakeClient {
  index: jest.Mock;
  delete: jest.Mock;
  search: jest.Mock;
  indices: { exists: jest.Mock; create: jest.Mock };
}

function fakeClient(hitIds: string[] = []): FakeClient {
  return {
    index: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    search: jest
      .fn()
      .mockResolvedValue({ hits: { hits: hitIds.map((_id) => ({ _id })) } }),
    indices: {
      exists: jest.fn().mockResolvedValue(false),
      create: jest.fn().mockResolvedValue({}),
    },
  };
}

/**
 * Built without running the constructor on purpose: the real one opens a
 * client against ELASTICSEARCH_URL, and none of what is asserted here needs an
 * engine. What it does need is the query the driver builds, which is where
 * tenant isolation actually lives.
 */
function driverWith(client: FakeClient): ElasticsearchSearchDriver {
  return Object.assign(
    Object.create(
      ElasticsearchSearchDriver.prototype,
    ) as ElasticsearchSearchDriver,
    { client, mappedCollections: new Set<string>() },
  );
}

describe('the Elasticsearch driver', () => {
  // A top-N search that learns about tenants only after the fact can fill its
  // whole page with another tenant's matches, so the filter has to travel
  // inside the query rather than run over the results.
  it('filters by tenant inside the query', async () => {
    const client = fakeClient();

    await driverWith(client).search(
      'blog_posts',
      'hello',
      ['title'],
      'acme',
      10,
    );

    expect(client.search).toHaveBeenCalledWith(
      expect.objectContaining({
        index: 'blog_posts',
        query: {
          bool: {
            must: { multi_match: { query: 'hello', fields: ['title'] } },
            filter: { term: { tenantId: 'acme' } },
          },
        },
      }),
    );
  });

  // Elasticsearch answers with its first 10 hits when no size is given, a cap
  // the caller never chose. One over the limit is what lets the kernel report
  // that the result set was cut.
  it('asks for one more hit than the limit', async () => {
    const client = fakeClient();

    await driverWith(client).search(
      'blog_posts',
      'hello',
      ['title'],
      'acme',
      3,
    );

    expect(client.search).toHaveBeenCalledWith(
      expect.objectContaining({ size: 4 }),
    );
  });

  it('reports the result set as truncated when there is one more', async () => {
    const matches = await driverWith(fakeClient(['a', 'b', 'c', 'd'])).search(
      'blog_posts',
      'hello',
      ['title'],
      'acme',
      3,
    );

    expect(matches).toEqual({
      ids: ['a', 'b', 'c'],
      truncated: true,
      limit: 3,
    });
  });

  it('reports it as complete when the hits fit', async () => {
    const matches = await driverWith(fakeClient(['a', 'b'])).search(
      'blog_posts',
      'hello',
      ['title'],
      'acme',
      3,
    );

    expect(matches).toEqual({ ids: ['a', 'b'], truncated: false, limit: 3 });
  });

  it('stamps the tenant onto every indexed document', async () => {
    const client = fakeClient();

    await driverWith(client).index(
      'blog_posts',
      'post-1',
      { title: 'Hello' },
      'acme',
    );

    expect(client.index).toHaveBeenCalledWith({
      index: 'blog_posts',
      id: 'post-1',
      document: { title: 'Hello', tenantId: 'acme' },
    });
  });

  /**
   * Left to its dynamic mapping, Elasticsearch types a first-seen string as
   * analysed text, and a term filter on that matches nothing -- which is how
   * every search once answered with zero hits while the documents sat in the
   * index. The tenant field is declared keyword before the first document.
   */
  it('declares the tenant field as a keyword before the first document', async () => {
    const client = fakeClient();

    await driverWith(client).index('blog_posts', 'post-1', {}, 'acme');

    expect(client.indices.create).toHaveBeenCalledWith({
      index: 'blog_posts',
      mappings: { properties: { tenantId: { type: 'keyword' } } },
    });
  });

  it('creates the mapping once per collection', async () => {
    const client = fakeClient();
    const driver = driverWith(client);

    await driver.index('blog_posts', 'post-1', {}, 'acme');
    await driver.index('blog_posts', 'post-2', {}, 'acme');

    expect(client.indices.create).toHaveBeenCalledTimes(1);
  });

  it('leaves an existing collection its own mapping', async () => {
    const client = fakeClient();
    client.indices.exists.mockResolvedValue(true);

    await driverWith(client).index('blog_posts', 'post-1', {}, 'acme');

    expect(client.indices.create).not.toHaveBeenCalled();
  });

  // Two processes reaching a fresh collection at once both see it missing, and
  // the loser is told it already exists -- which is the state it asked for.
  it('tolerates losing the race to create a collection', async () => {
    const client = fakeClient();
    client.indices.create.mockRejectedValue({
      body: { error: { type: 'resource_already_exists_exception' } },
    });

    await expect(
      driverWith(client).index('blog_posts', 'post-1', {}, 'acme'),
    ).resolves.toBeUndefined();
  });

  it('raises anything else the creation fails with', async () => {
    const client = fakeClient();
    client.indices.create.mockRejectedValue(new Error('cluster is read-only'));

    await expect(
      driverWith(client).index('blog_posts', 'post-1', {}, 'acme'),
    ).rejects.toThrow('cluster is read-only');
  });

  it('ignores a 404 when removing a document that is already gone', async () => {
    const client = fakeClient();

    await driverWith(client).remove('blog_posts', 'post-1');

    expect(client.delete).toHaveBeenCalledWith(
      { index: 'blog_posts', id: 'post-1' },
      { ignore: [404] },
    );
  });
});
