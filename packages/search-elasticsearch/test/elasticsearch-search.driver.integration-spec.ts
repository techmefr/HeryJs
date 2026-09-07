import { Client } from '@elastic/elasticsearch';
import { ElasticsearchSearchDriver } from '../src/runtime/elasticsearch-search.driver';
import type { SearchDriver } from '#kernel/search/search-driver';

/**
 * This one talks to a real Elasticsearch, because the bug it guards against
 * lived entirely in the server's behaviour: the driver's calls were shaped
 * correctly, the client accepted them, and a mock would have agreed with every
 * one of them. What no mock could say is that dynamic mapping had typed
 * `tenantId` as analysed text, so the `term` filter matched nothing and every
 * search returned an empty page while the documents sat in the index.
 */
const node = process.env.ELASTICSEARCH_URL ?? 'http://localhost:9200';
const collection = `heryjs-driver-test-${process.pid}`;
const fields = ['title', 'body'] as const;

let driver: SearchDriver;
let client: Client;

async function indexed(
  id: string,
  document: Record<string, unknown>,
  tenantId: string,
): Promise<void> {
  await driver.index(collection, id, document, tenantId);
  // The driver does not force a refresh per write -- Elasticsearch is near
  // real time by design and paying a refresh on every document would be a
  // cost the caller never asked for. A test that reads back immediately has
  // to ask for one itself.
  await client.indices.refresh({ index: collection });
}

beforeAll(async () => {
  client = new Client({ node });
  await client.indices.delete({ index: collection }, { ignore: [404] });
  driver = new ElasticsearchSearchDriver();
});

afterAll(async () => {
  await client.indices.delete({ index: collection }, { ignore: [404] });
  await client.close();
});

describe('ElasticsearchSearchDriver', () => {
  it('declares the tenant field as a keyword instead of leaving it to dynamic mapping', async () => {
    await indexed('a1', { title: 'alpha widget', body: 'first' }, 'tenant-1');

    const mapping = await client.indices.getMapping({ index: collection });
    const properties = mapping[collection]?.mappings.properties;

    expect(properties?.tenantId).toEqual({ type: 'keyword' });
  });

  it('finds a document it has just indexed', async () => {
    await indexed('a2', { title: 'alpha gadget', body: 'second' }, 'tenant-1');

    const matches = await driver.search(
      collection,
      'alpha',
      fields,
      'tenant-1',
      10,
    );

    expect(matches.ids).toContain('a2');
    expect(matches.truncated).toBe(false);
  });

  it('never answers with another tenant matches', async () => {
    await indexed('b1', { title: 'alpha intruder', body: 'other' }, 'tenant-2');

    const mine = await driver.search(
      collection,
      'alpha',
      fields,
      'tenant-1',
      10,
    );
    const theirs = await driver.search(
      collection,
      'alpha',
      fields,
      'tenant-2',
      10,
    );

    expect(mine.ids).not.toContain('b1');
    expect(theirs.ids).toEqual(['b1']);
  });

  it('reports truncation when more matches exist than the limit allows', async () => {
    await indexed('a3', { title: 'alpha thing', body: 'third' }, 'tenant-1');

    const matches = await driver.search(
      collection,
      'alpha',
      fields,
      'tenant-1',
      2,
    );

    expect(matches.ids).toHaveLength(2);
    expect(matches.truncated).toBe(true);
    expect(matches.limit).toBe(2);
  });

  it('stops returning a document once it is removed', async () => {
    await driver.remove(collection, 'a1', 'tenant-1');
    await client.indices.refresh({ index: collection });

    const matches = await driver.search(
      collection,
      'alpha',
      fields,
      'tenant-1',
      10,
    );

    expect(matches.ids).not.toContain('a1');
    expect(matches.ids).toEqual(expect.arrayContaining(['a2', 'a3']));
  });

  it('does not fail on removing an id that is not there', async () => {
    await expect(
      driver.remove(collection, 'never-indexed', 'tenant-1'),
    ).resolves.toBeUndefined();
  });
});
