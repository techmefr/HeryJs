import { PrismaSearchDriver } from './prisma-search.driver';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';

interface FindManyArgs {
  where: Record<string, unknown>;
  select: { id: true };
  take: number;
}

function driverOver(rowCount: number) {
  const calls: FindManyArgs[] = [];
  const prisma = {
    blogPost: {
      findMany: (args: FindManyArgs) => {
        calls.push(args);
        return Promise.resolve(
          Array.from({ length: Math.min(rowCount, args.take) }, (_, index) => ({
            id: `id-${index}`,
          })),
        );
      },
    },
  } as unknown as TenantScopedPrismaClient;

  return { driver: new PrismaSearchDriver(prisma), calls };
}

/**
 * The driver used to have no LIMIT at all, so a one-letter term walked every
 * matching row, and the route above it had no way to say the result set had
 * been cut -- because it never was, until the row count made it a problem.
 */
describe('PrismaSearchDriver', () => {
  it('asks for one row past the limit so it can tell the two cases apart', async () => {
    const { driver, calls } = driverOver(3);

    const matches = await driver.search('blog-post', 'term', ['title'], 't', 5);

    expect(calls[0]?.take).toBe(6);
    expect(matches).toEqual({
      ids: ['id-0', 'id-1', 'id-2'],
      truncated: false,
      limit: 5,
    });
  });

  it('reports truncation and hands back exactly the limit', async () => {
    const { driver } = driverOver(50);

    const matches = await driver.search('blog-post', 'term', ['title'], 't', 5);

    expect(matches.ids).toHaveLength(5);
    expect(matches.truncated).toBe(true);
    expect(matches.limit).toBe(5);
  });

  it('does not call a result set exactly at the limit truncated', async () => {
    const { driver } = driverOver(5);

    const matches = await driver.search('blog-post', 'term', ['title'], 't', 5);

    expect(matches.ids).toHaveLength(5);
    expect(matches.truncated).toBe(false);
  });

  it('searches the resolved text of a JSON field in memory and the other fields in SQL', async () => {
    const calls: { select: Record<string, true> }[] = [];
    const prisma = {
      blogPost: {
        findMany: (args: { select: Record<string, true> }) => {
          calls.push(args);

          return Promise.resolve(
            args.select.summary
              ? [
                  { id: 'hit', summary: { en: 'the BETA release' } },
                  { id: 'miss', summary: { en: 'other' } },
                  { id: 'empty', summary: null },
                ]
              : [{ id: 'sql-hit' }],
          );
        },
      },
    } as unknown as TenantScopedPrismaClient;
    const driver = new PrismaSearchDriver(prisma);

    const matches = await driver.search(
      'blog-post',
      'beta',
      ['title', 'summary'],
      't',
      10,
    );

    expect(matches.ids).toEqual(['sql-hit', 'hit']);
    expect(calls).toHaveLength(2);
  });

  it('does not query SQL at all when every searched field is JSON', async () => {
    const calls: { select: Record<string, true> }[] = [];
    const prisma = {
      blogPost: {
        findMany: (args: { select: Record<string, true> }) => {
          calls.push(args);

          return Promise.resolve([{ id: 'hit', summary: { en: 'beta' } }]);
        },
      },
    } as unknown as TenantScopedPrismaClient;

    const matches = await new PrismaSearchDriver(prisma).search(
      'blog-post',
      'beta',
      ['summary'],
      't',
      10,
    );

    expect(matches.ids).toEqual(['hit']);
    expect(calls).toHaveLength(1);
  });
});
