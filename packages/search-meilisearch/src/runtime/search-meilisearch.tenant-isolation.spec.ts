import { MeilisearchSearchDriver } from './meilisearch-search.driver';

interface StoredDocument {
  id: string;
  tenantId: string;
  title: string;
}

function engine(): { client: object; stored: StoredDocument[] } {
  const stored: StoredDocument[] = [];

  const theIndex = {
    updateFilterableAttributes: jest.fn().mockResolvedValue({ taskUid: 1 }),
    addDocuments: jest.fn((documents: StoredDocument[]) => {
      stored.push(...documents);
      return Promise.resolve({ taskUid: 2 });
    }),
    getDocument: jest.fn((id: string) => {
      const document = stored.find((candidate) => candidate.id === id);

      return document
        ? Promise.resolve({ tenantId: document.tenantId })
        : Promise.reject(
            Object.assign(new Error('missing'), {
              cause: { code: 'document_not_found' },
            }),
          );
    }),
    deleteDocument: jest.fn((id: string) => {
      const position = stored.findIndex((document) => document.id === id);
      if (position >= 0) {
        stored.splice(position, 1);
      }

      return Promise.resolve({ taskUid: 3 });
    }),
    search: jest.fn((term: string, options: { filter: string }) => {
      const tenant = JSON.parse(
        options.filter.replace(/^tenantId = /, ''),
      ) as string;
      const hits = stored.filter(
        (document) =>
          document.tenantId === tenant && document.title.includes(term),
      );

      return Promise.resolve({ hits: hits.map(({ id }) => ({ id })) });
    }),
  };

  return {
    stored,
    client: {
      index: jest.fn().mockReturnValue(theIndex),
      tasks: {
        waitForTask: jest.fn().mockResolvedValue({ status: 'succeeded' }),
      },
    },
  };
}

function driverOn(client: object): MeilisearchSearchDriver {
  return Object.assign(
    Object.create(MeilisearchSearchDriver.prototype) as MeilisearchSearchDriver,
    { client, filterableConfigured: new Set<string>() },
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

    expect(stored[0]?.tenantId).toBe('tenant-a');
  });

  it('keeps a tenant id that looks like a filter expression a single literal', async () => {
    const { client } = engine();
    const driver = driverOn(client);
    await driver.index('posts', 'b-1', { title: 'hello' }, 'tenant-b');

    const matches = await driver.search(
      'posts',
      'hello',
      ['title'],
      'x" OR tenantId = "tenant-b',
      10,
    );

    expect(matches.ids).toEqual([]);
  });

  it('never lets tenant A remove a document tenant B indexed', async () => {
    const { client } = engine();
    const driver = driverOn(client);
    await driver.index('posts', 'b-1', { title: 'hello world' }, 'tenant-b');

    await driver.remove('posts', 'b-1', 'tenant-a');

    const matches = await driver.search(
      'posts',
      'hello',
      ['title'],
      'tenant-b',
      10,
    );

    expect(matches.ids).toEqual(['b-1']);
  });
});
