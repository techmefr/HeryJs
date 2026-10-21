import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { runInNewContext } from 'node:vm';
import { loadBlueprint } from './blueprint';
import { buildResourceContext } from './resource-context';
import type { ResourceContext } from './resource-context';
import {
  AGGREGATE_TYPES,
  FILTER_OPERATORS,
  MAX_BATCH_ENTRIES,
  MAX_CAPABILITIES,
  MAX_FILTERS,
  MAX_IN_VALUES,
  MAX_INCLUDE_LIMIT,
  MAX_PAGE,
  MAX_RELATIONS,
  MAX_SELECTS,
  MAX_SORTS,
  filterableFields,
  nestedIncludesOf,
  ownRouteIncludes,
  recordProperties,
  selectableFields,
} from './openapi-contract';
import { discoverResourceContexts } from './openapi';
import { controllerFile, dtoFile, viewFile } from './templates';

interface Contract {
  sorts: string[];
  filters: string[];
  selects: string[];
  includes: Record<
    string,
    {
      type: string;
      filters: string[];
      sorts: string[];
      selects: string[];
      includes?: Contract['includes'];
    }
  >;
  aggregates: Record<
    string,
    { type: string; filters: string[]; fields: string[] }
  >;
  limits?: number[];
  defaultLimit?: number;
}

const SERVER_HTTP = path.join(
  __dirname,
  '..',
  '..',
  'src',
  'technical',
  'http',
);
const EXAMPLES = path.join(__dirname, '..', '..', 'examples');
const contexts: ResourceContext[] = [
  buildResourceContext(loadBlueprint(path.join(EXAMPLES, 'blog-post.yaml'))),
  ...discoverResourceContexts(
    path.join(__dirname, 'fixtures', 'openapi', 'blueprints'),
  ),
];

function contractLiteral(source: string, marker: string): Contract {
  const start = source.indexOf(marker);
  const end = source.indexOf(' as const satisfies ListQueryContract', start);
  if (start === -1 || end === -1) {
    throw new Error(`no ${marker} in generated controller`);
  }
  const literal = source.slice(start + marker.length, end);
  return JSON.parse(
    JSON.stringify(runInNewContext(`(${literal})`)),
  ) as Contract;
}

function ownContract(ctx: ResourceContext): Contract {
  return contractLiteral(
    controllerFile(ctx),
    `const ${ctx.screamingSnakeName}_CONTRACT = `,
  );
}

describe('what the generators claim against what the controller publishes', () => {
  it('uses the same filter operators, aggregate types and batch bound as the server', () => {
    const listQuery = readFileSync(
      path.join(SERVER_HTTP, 'list-query.ts'),
      'utf8',
    );
    const batch = readFileSync(path.join(SERVER_HTTP, 'batch.ts'), 'utf8');
    const tuple = (name: string): string[] => {
      const body = new RegExp(
        `export const ${name} = \\[([^\\]]*)\\] as const`,
      ).exec(listQuery)![1]!;
      return [...body.matchAll(/'([^']+)'/g)].map((match) => match[1]!);
    };
    const limit = (name: string): number =>
      Number(
        new RegExp(`const ${name} = ([0-9_]+);`)
          .exec(listQuery)![1]!
          .replace(/_/g, ''),
      );

    expect([...FILTER_OPERATORS]).toEqual(tuple('FILTER_OPERATORS'));
    expect([...AGGREGATE_TYPES]).toEqual(tuple('AGGREGATE_TYPES'));
    expect(MAX_BATCH_ENTRIES).toBe(
      Number(/MAX_BATCH_ENTRIES = (\d+)/.exec(batch)![1]),
    );
    expect([
      MAX_FILTERS,
      MAX_SORTS,
      MAX_SELECTS,
      MAX_RELATIONS,
      MAX_IN_VALUES,
      MAX_CAPABILITIES,
      MAX_INCLUDE_LIMIT,
      MAX_PAGE,
    ]).toEqual([
      limit('MAX_FILTERS'),
      limit('MAX_SORTS'),
      limit('MAX_SELECTS'),
      limit('MAX_RELATIONS'),
      limit('MAX_IN_VALUES'),
      limit('MAX_CAPABILITIES'),
      limit('MAX_INCLUDE_LIMIT'),
      limit('MAX_PAGE'),
    ]);
  });

  it.each(
    contexts.map((ctx) => [`${ctx.pascalName}@${ctx.version}`, ctx] as const),
  )('matches the %s search contract', (_name, ctx) => {
    const contract = ownContract(ctx);
    expect(selectableFields(ctx)).toEqual(contract.selects);
    expect(filterableFields(ctx)).toEqual(contract.filters);
    expect([...ctx.sorts]).toEqual(contract.sorts);
    expect(ctx.pagination?.limits).toEqual(contract.limits);
    expect(ctx.pagination?.default).toEqual(contract.defaultLimit);
    expect(Object.keys(contract.includes)).toEqual(
      ctx.includes.map((include) => include.relation),
    );
    expect(Object.keys(contract.aggregates)).toEqual(
      ctx.aggregates.map((aggregate) => aggregate.relation),
    );
  });

  it.each(
    contexts.map((ctx) => [`${ctx.pascalName}@${ctx.version}`, ctx] as const),
  )(
    'matches the %s include and aggregate allow-lists, nested ones too',
    (_name, ctx) => {
      const contract = ownContract(ctx);
      const compare = (
        links: readonly ResourceContext['includes'][number][],
        published: Contract['includes'],
      ): void => {
        for (const link of links) {
          const entry = published[link.relation]!;
          expect(entry.type).toBe(link.type);
          expect(entry.filters).toEqual([...link.filters]);
          expect(entry.sorts).toEqual([...link.sorts]);
          expect(entry.selects).toEqual([...link.selects]);
          compare(nestedIncludesOf(link), entry.includes ?? {});
          expect(Object.keys(entry.includes ?? {})).toEqual(
            nestedIncludesOf(link).map((nested) => nested.relation),
          );
        }
      };
      compare(ctx.includes, contract.includes);
      for (const aggregate of ctx.aggregates) {
        const entry = contract.aggregates[aggregate.relation]!;
        expect(entry.filters).toEqual([...aggregate.filters]);
        expect(entry.fields).toEqual([...aggregate.fields]);
      }
    },
  );

  it.each(
    contexts.map((ctx) => [`${ctx.pascalName}@${ctx.version}`, ctx] as const),
  )('matches the %s parent-scoped routes', (_name, ctx) => {
    const source = controllerFile(ctx);
    const routes = [...source.matchAll(/@Post\(':id\/(\w+)\/search'\)/g)].map(
      (match) => match[1],
    );
    expect(routes).toEqual(
      ownRouteIncludes(ctx).map((include) => include.relation),
    );
    for (const include of ownRouteIncludes(ctx)) {
      const child = contractLiteral(
        source,
        `const ${ctx.screamingSnakeName}_${include.relation.replace(/([A-Z])/g, '_$1').toUpperCase()}_CONTRACT = `,
      );
      expect(child.filters).toEqual(['id', ...include.filters]);
      expect(child.selects).toEqual([...include.selects]);
      expect(child.limits).toEqual(include.pagination?.limits);
    }
  });

  it.each(
    contexts.map((ctx) => [`${ctx.pascalName}@${ctx.version}`, ctx] as const),
  )('matches the %s record with the view schema', (_name, ctx) => {
    const view = viewFile(ctx);
    const body = view.slice(view.indexOf('z.object({'), view.indexOf('});'));
    const keys = [...body.matchAll(/^ {2}(\w+):/gm)].map((match) => match[1]);
    expect(recordProperties(ctx).map((property) => property.name)).toEqual(
      keys,
    );
  });

  it.each(
    contexts.map((ctx) => [`${ctx.pascalName}@${ctx.version}`, ctx] as const),
  )('matches the %s mutation bodies with the DTO', (_name, ctx) => {
    const dto = dtoFile(ctx);
    expect(dto).toContain(
      `data: z.array(create${ctx.pascalName}Schema).max(MAX_BATCH_ENTRIES)`,
    );
    expect(dto).toContain(`ids: z.array(z.string()).max(MAX_BATCH_ENTRIES)`);
    expect(dto.includes('z.enum(DELETE_MODES)')).toBe(ctx.softDeletes);
    expect(dto.includes(`Restore${ctx.pascalName}RequestBody`)).toBe(
      ctx.softDeletes,
    );
    expect(dto.includes('relationMutationSchema')).toBe(
      ctx.relations.length > 0,
    );
  });
});
