import type { DescribedController } from '@heryjs/core/technical/introspection/introspection.service';

export interface RouteRow {
  method: string;
  path: string;
  capability: string;
  rateLimit: string;
}

const NONE = '-';

export function routeRows(controllers: DescribedController[]): RouteRow[] {
  return controllers.flatMap((controller) =>
    controller.routes.map((route) => ({
      method: route.method,
      path: joinPath(controller.basePath, route.path),
      capability: route.capability
        ? route.capability
        : route.publicReason
          ? `public (${route.publicReason})`
          : NONE,
      rateLimit: route.rateLimit
        ? route.rateLimit
        : route.rateLimitExemption
          ? `exempt (${route.rateLimitExemption})`
          : NONE,
    })),
  );
}

function joinPath(basePath: string, routePath: string): string {
  const joined = `${basePath}${routePath === '/' ? '' : routePath}`;

  return joined === '' ? '/' : joined;
}

export function unguardedRows(rows: RouteRow[]): RouteRow[] {
  return rows.filter(
    (row) => row.capability === NONE || row.rateLimit === NONE,
  );
}

const HEADERS: Record<keyof RouteRow, string> = {
  method: 'METHOD',
  path: 'PATH',
  capability: 'CAPABILITY',
  rateLimit: 'RATE LIMIT',
};

const COLUMNS: Array<keyof RouteRow> = [
  'method',
  'path',
  'capability',
  'rateLimit',
];

export function formatRouteTable(rows: RouteRow[]): string {
  const widths = COLUMNS.map((column) =>
    Math.max(HEADERS[column].length, ...rows.map((row) => row[column].length)),
  );

  const line = (cells: string[]): string =>
    cells
      .map((cell, index) => cell.padEnd(widths[index] as number))
      .join('  ')
      .trimEnd();

  return [
    line(COLUMNS.map((column) => HEADERS[column])),
    line(widths.map((width) => '-'.repeat(width))),
    ...rows.map((row) => line(COLUMNS.map((column) => row[column]))),
  ].join('\n');
}

export function sortRows(rows: RouteRow[]): RouteRow[] {
  return [...rows].sort(
    (left, right) =>
      left.path.localeCompare(right.path) ||
      left.method.localeCompare(right.method),
  );
}
