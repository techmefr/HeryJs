import { ElasticsearchSearchDriver } from './elasticsearch-search.driver';

interface IndexedDocument {
  index: string;
  id: string;
  document: Record<string, unknown>;
}

interface SearchRequest {
  index: string;
  query: {
    bool: {
      must: { multi_match: { query: string } };
      filter: { term: { tenantId: string } };
    };
  };
}

function engine(): { client: object; stored: IndexedDocument[] } {
  const stored: IndexedDocument[] = [];

  const client = {
    index: jest.fn((request: IndexedDocument) => {
      stored.push(request);
      return Promise.resolve({});
    }),
    delete: jest.fn().mockResolvedValue({}),
    search: jest.fn((request: SearchRequest) => {
      const { must, filter } = request.query.bool;
      const hits = stored
        .filter(
          (entry) =>
            entry.index === request.index &&
            entry.document.tenantId === filter.term.tenantId &&
            String(entry.document.title).includes(must.multi_match.query),
        )
        .map((entry) => ({ _id: entry.id }));

      return Promise.resolve({ hits: { hits } });
    }),
    indices: {
      exists: jest.fn().mockResolvedValue(true),
      create: jest.fn().mockResolvedValue({}),
    },
  };

  return { client, stored };
}

function driverOn(client: object): ElasticsearchSearchDriver {
  return Object.assign(
    Object.create(
      ElasticsearchSearchDriver.prototype,
    ) as ElasticsearchSearchDriver,
    { client, mappedCollections: new Set<string>() },
  );
}

describe('tenant isolation', () => {
  it('never answers tenant A with a document tenant B indexed', async () => {
    const { client } = engine();
    const driver = driverOn(client);
    await driver.index('posts', 'a-1', { title: 'hello world' }, 'tenant-a');
    await driver.index('posts', 'b-1', { title: 'hello world' }, 'tenant-b');

    const matches = await driver.search(
      'posts',
      'hello',
      ['title'],
      'tenant-a',
      10,
    );

    expect(matches.ids).toEqual(['a-1']);
  });

  it('stamps the indexing tenant over a tenantId smuggled in the document', async () => {
    const { client, stored } = engine();
    const driver = driverOn(client);

    await driver.index(
      'posts',
      'a-1',
      { title: 'hello', tenantId: 'tenant-b' },
      'tenant-a',
    );

    expect(stored[0]?.document.tenantId).toBe('tenant-a');
    await expect(
      driver.search('posts', 'hello', ['title'], 'tenant-b', 10),
    ).resolves.toMatchObject({ ids: [] });
  });
});
