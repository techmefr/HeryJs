import { Meilisearch } from 'meilisearch';
import { MeilisearchSearchDriver } from '../src/runtime/meilisearch-search.driver';
import type { SearchDriver } from '#kernel/search/search-driver';

/**
 * This one talks to a real Meilisearch, because the bug it guards against was
 * invisible from the client side: every call was accepted, every method
 * resolved, and the failure happened afterwards inside a task nobody read.
 * A mock would have reported four indexed documents where the server had
 * refused all four.
 */
const host = process.env.MEILISEARCH_URL ?? 'http://localhost:7700';
const apiKey = process.env.MEILISEARCH_API_KEY ?? 'heryjs-dev-master-key';
const collection = `heryjs-driver-test-${process.pid}`;
const rejecting = `${collection}-rejecting`;
const fields = ['title', 'body'] as const;

let driver: SearchDriver;
let client: Meilisearch;

async function dropped(index: string): Promise<void> {
  const task = await client.index(index).delete();
  await client.tasks.waitForTask(task.taskUid);
}

beforeAll(async () => {
  client = new Meilisearch({ host, apiKey });
  await dropped(collection);
  await dropped(rejecting);
  driver = new MeilisearchSearchDriver();

  await driver.index(
    collection,
    'a1',
    { title: 'alpha widget', body: 'first' },
    'tenant-1',
  );
  await driver.index(
    collection,
    'a2',
    { title: 'alpha gadget', body: 'second' },
    'tenant-1',
  );
  await driver.index(
    collection,
    'a3',
    { title: 'alpha thing', body: 'third' },
    'tenant-1',
  );
  await driver.index(
    collection,
    'b1',
    { title: 'alpha intruder', body: 'other' },
    'tenant-2',
  );
});

afterAll(async () => {
  await dropped(collection);
  await dropped(rejecting);
});

describe('MeilisearchSearchDriver', () => {
  it('actually stores the documents it reports as indexed', async () => {
    const documents = await client.index(collection).getDocuments();

    expect(documents.total).toBe(4);
  });

  it('names the primary key instead of leaving it to inference', async () => {
    const index = await client.index(collection).getRawInfo();

    expect(index.primaryKey).toBe('id');
  });

  it('finds the documents it has indexed', async () => {
    const matches = await driver.search(
      collection,
      'alpha',
      fields,
      'tenant-1',
      10,
    );

    expect(matches.ids.sort()).toEqual(['a1', 'a2', 'a3']);
    expect(matches.truncated).toBe(false);
  });

  it('never answers with another tenant matches', async () => {
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

    const matches = await driver.search(
      collection,
      'alpha',
      fields,
      'tenant-1',
      10,
    );

    expect(matches.ids.sort()).toEqual(['a2', 'a3']);
  });

  it('raises when the server refuses a write instead of reporting success', async () => {
    // An index whose primary key is a field the driver never sends: every
    // document it offers is rejected, which is exactly the shape of failure
    // that used to pass for success.
    const created = await client.createIndex(rejecting, { primaryKey: 'slug' });
    await client.tasks.waitForTask(created.taskUid);

    await expect(
      driver.index(rejecting, 'c1', { title: 'alpha' }, 'tenant-1'),
    ).rejects.toMatchObject({ key: 'search.meilisearch.task_failed' });
  });
});
