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
});
