import type { DescribedController } from '#technical/introspection/introspection.service';
import {
  formatRouteTable,
  routeRows,
  sortRows,
  unguardedRows,
} from './routes-table';

const controllers: DescribedController[] = [
  {
    name: 'PostController',
    basePath: '/posts',
    routes: [
      {
        method: 'GET',
        path: '/',
        handler: 'search',
        capability: 'canViewAnyPost',
        rateLimit: 'read',
      },
      {
        method: 'POST',
        path: '/:id/publish',
        handler: 'publish',
        capability: 'canPublishPost',
      },
    ],
  },
  {
    name: 'HookController',
    basePath: '/hooks',
    routes: [
      {
        method: 'POST',
        path: '/',
        handler: 'receive',
        publicReason: 'signed by its sender',
        rateLimitExemption: 'sender is trusted',
      },
    ],
  },
];

describe('routes table', () => {
  it('joins the controller path and the route path', () => {
    expect(routeRows(controllers).map((row) => row.path)).toEqual([
      '/posts',
      '/posts/:id/publish',
      '/hooks',
    ]);
  });

  it('shows a stated exemption in place of a capability or a bucket', () => {
    const [, , hook] = routeRows(controllers);

    expect(hook?.capability).toBe('public (signed by its sender)');
    expect(hook?.rateLimit).toBe('exempt (sender is trusted)');
  });

  it('finds the routes missing a capability or a rate limit', () => {
    const rows = unguardedRows(routeRows(controllers));

    expect(rows.map((row) => row.path)).toEqual(['/posts/:id/publish']);
  });

  it('sorts by path then method', () => {
    const rows = sortRows(routeRows(controllers));

    expect(rows.map((row) => row.path)).toEqual([
      '/hooks',
      '/posts',
      '/posts/:id/publish',
    ]);
  });

  it('pads every column to its widest cell', () => {
    const table = formatRouteTable(routeRows(controllers)).split('\n');

    expect(table[0]).toMatch(/^METHOD +PATH +CAPABILITY +RATE LIMIT$/);
    expect(table).toHaveLength(5);
    expect(table[2]).toMatch(/^GET {5}\/posts +canViewAnyPost +read$/);
  });
});
