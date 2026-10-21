import * as path from 'node:path';
import { loadBlueprint } from './blueprint';
import { buildResourceContext } from './resource-context';
import { OPENAPI_ABSENCES } from './openapi-contract';
import { buildOpenApiDocument, discoverResourceContexts } from './openapi';

interface Operation {
  operationId: string;
  requestBody?: { content: Record<string, { schema: { $ref: string } }> };
  responses: Record<string, unknown>;
}

interface Document {
  openapi: string;
  info: { description: string };
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, Record<string, unknown>> };
}

const EXAMPLES = path.join(__dirname, '..', '..', 'examples');
const blogPost = buildResourceContext(
  loadBlueprint(path.join(EXAMPLES, 'blog-post.yaml')),
);
const fixtureContexts = discoverResourceContexts(
  path.join(__dirname, 'fixtures', 'openapi', 'blueprints'),
);

function documentOf(
  ...contexts: Parameters<typeof buildOpenApiDocument>[0]
): Document {
  return buildOpenApiDocument(contexts) as unknown as Document;
}

function schema(document: Document, name: string): Record<string, unknown> {
  const found = document.components.schemas[name];
  if (!found) {
    throw new Error(`no schema ${name}`);
  }
  return found;
}

function properties(
  document: Document,
  name: string,
): Record<string, Record<string, unknown>> {
  return schema(document, name).properties as Record<
    string,
    Record<string, unknown>
  >;
}

function collectRefs(node: unknown, found: Set<string>): Set<string> {
  if (Array.isArray(node)) {
    node.forEach((item) => collectRefs(item, found));
  } else if (typeof node === 'object' && node !== null) {
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string') {
        found.add(value);
      } else {
        collectRefs(value, found);
      }
    }
  }
  return found;
}

describe('discoverResourceContexts', () => {
  it('finds every routed blueprint and skips the ones only included from another', () => {
    expect(
      fixtureContexts
        .map((found) => `${found.pascalName}@${found.version}`)
        .sort(),
    ).toEqual(['Widget@1', 'Widget@2']);
  });

  it('returns nothing for a directory that does not exist', () => {
    expect(
      discoverResourceContexts(path.join(__dirname, 'fixtures', 'nope')),
    ).toEqual([]);
  });
});

describe('buildOpenApiDocument for a paginated, soft-deleting resource with includes and relations', () => {
  const document = documentOf(blogPost);

  it('declares OpenAPI 3.1 with bearer security', () => {
    expect(document.openapi).toBe('3.1.0');
    expect(document.components.schemas).toBeDefined();
    expect(JSON.stringify(document)).toContain('"bearerAuth"');
  });

  it('mounts exactly the routes the controller mounts, restore and the parent-scoped child route included', () => {
    expect(Object.keys(document.paths).sort()).toEqual([
      '/blog-posts/create',
      '/blog-posts/delete',
      '/blog-posts/describe',
      '/blog-posts/restore',
      '/blog-posts/search',
      '/blog-posts/update',
      '/blog-posts/{id}/notes/search',
    ]);
  });

  it('answers 200 on search and 201 on every mutation, as the controller does', () => {
    const status = (route: string): string[] =>
      Object.keys(Object.values(document.paths[route]!)[0]!.responses).filter(
        (code) => code.startsWith('2'),
      );

    expect(status('/blog-posts/search')).toEqual(['200']);
    expect(status('/blog-posts/describe')).toEqual(['200']);
    for (const route of ['create', 'update', 'delete', 'restore']) {
      expect(status(`/blog-posts/${route}`)).toEqual(['201']);
    }
  });

  it('types the record the way the view returns it, tenant and owner included', () => {
    const record = schema(document, 'BlogPost');
    expect(Object.keys(properties(document, 'BlogPost'))).toEqual([
      'id',
      'tenantId',
      'ownerId',
      'title',
      'summary',
      'summaryTranslations',
      'body',
      'createdAt',
      'updatedAt',
      'deletedAt',
    ]);
    expect(properties(document, 'BlogPost').summaryTranslations).toEqual({
      type: 'object',
      additionalProperties: { type: 'string' },
    });
    expect(properties(document, 'BlogPost').deletedAt).toEqual({
      anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }],
    });
    expect(record.required).toEqual(
      Object.keys(properties(document, 'BlogPost')),
    );
  });

  it('shapes sorts as field and direction entries limited to the declared sorts', () => {
    const sorts = properties(document, 'BlogPostSearchRequest').sorts as {
      items: {
        properties: {
          field: { enum: string[] };
          direction: { enum: string[] };
        };
      };
    };
    expect(sorts.items.properties.field.enum).toEqual(['createdAt', 'summary']);
    expect(sorts.items.properties.direction.enum).toEqual(['asc', 'desc']);
  });

  it('restricts limit to the declared page sizes', () => {
    const search = properties(document, 'BlogPostSearchRequest');
    expect(search.limit).toMatchObject({ enum: [10, 15, 20], default: 15 });
  });

  it('allows a trash flag because this resource keeps a bin', () => {
    expect(properties(document, 'BlogPostSearchRequest').withTrashed).toEqual({
      type: 'boolean',
    });
  });

  it('offers each declared include, with the nested limit only on the hasMany one', () => {
    const includes = properties(document, 'BlogPostSearchRequest').includes as {
      items: { oneOf: Array<{ properties: Record<string, unknown> }> };
    };
    const [notes, comments] = includes.items.oneOf;
    expect(notes!.properties.relation).toEqual({ const: 'notes' });
    expect(notes!.properties.limit).toBeDefined();
    expect(comments!.properties.relation).toEqual({ const: 'comments' });
    expect(comments!.properties.limit).toBeUndefined();
  });

  it('only lets avg and friends name a field the relation declares as aggregatable', () => {
    const aggregates = properties(document, 'BlogPostSearchRequest')
      .aggregates as {
      items: {
        oneOf: Array<{
          properties: { type: { enum: string[] }; field?: { enum: string[] } };
        }>;
      };
    };
    const variants = aggregates.items.oneOf;
    expect(
      variants.some(
        (variant) => variant.properties.field?.enum.join() === 'rating',
      ),
    ).toBe(true);
    expect(
      variants.filter((variant) =>
        variant.properties.type.enum.includes('avg'),
      ),
    ).toHaveLength(1);
  });

  it('describes relation mutations only because the blueprint declares a relation', () => {
    expect(document.components.schemas.RelationMutation).toBeDefined();
    expect(properties(document, 'BlogPostUpdateItem').relations).toBeDefined();
  });

  it('requires only the non-optional fields on create, and none beyond id on update', () => {
    expect(schema(document, 'BlogPostCreateItem').required).toEqual(['title']);
    expect(schema(document, 'BlogPostUpdateItem').required).toEqual(['id']);
  });

  it("scopes the child route to its parent and to the child blueprint's own pagination", () => {
    const child = document.paths['/blog-posts/{id}/notes/search']!.post!;
    expect(child.requestBody!.content['application/json']!.schema.$ref).toBe(
      '#/components/schemas/BlogPostNotesRowsSearchRequest',
    );
    expect(
      properties(document, 'BlogPostNotesRowsSearchRequest').limit,
    ).toMatchObject({
      enum: [5, 10],
    });
  });

  it('resolves every $ref it emits', () => {
    const names = new Set(Object.keys(document.components.schemas));
    const missing = [...collectRefs(document, new Set())]
      .map((reference) => reference.replace('#/components/schemas/', ''))
      .filter((name) => !names.has(name));
    expect(missing).toEqual([]);
  });

  it('states what it does not know in the document itself', () => {
    for (const absence of OPENAPI_ABSENCES) {
      expect(document.info.description).toContain(absence);
    }
  });
});

describe('buildOpenApiDocument for an unpaginated resource with no bin and a hidden field', () => {
  const document = documentOf(...fixtureContexts);

  it('emits no restore route and no trash flag', () => {
    expect(document.paths['/widgets/restore']).toBeUndefined();
    expect(
      properties(document, 'WidgetSearchRequest').withTrashed,
    ).toMatchObject({ not: {} });
    expect(properties(document, 'WidgetDeleteRequest').mode).toBeUndefined();
  });

  it('rejects page and limit instead of accepting a no-op', () => {
    const search = properties(document, 'WidgetSearchRequest');
    expect(search.page).toMatchObject({ not: {} });
    expect(search.limit).toMatchObject({ not: {} });
  });

  it('reports the unpaginated meta shape', () => {
    const meta = (
      document.paths['/widgets/search']!.post!.responses['200'] as {
        content: {
          'application/json': {
            schema: {
              properties: { meta: { properties: Record<string, unknown> } };
            };
          };
        };
      }
    ).content['application/json'].schema.properties.meta;
    expect(meta.properties.paginated).toEqual({ const: false });
    expect(meta.properties.page).toBeUndefined();
  });

  it('keeps a hidden field out of the record and out of selects, but accepts it on create', () => {
    expect(properties(document, 'Widget').secret).toBeUndefined();
    expect(properties(document, 'Widget').teamId).toBeDefined();
    expect(properties(document, 'WidgetCreateItem').secret).toBeDefined();
    const selects = properties(document, 'WidgetSearchRequest').selects as {
      items: { properties: { field: { enum: string[] } } };
    };
    expect(selects.items.properties.field.enum).not.toContain('secret');
  });

  it('types an optional field as nullable on the record and as plain on create', () => {
    expect(properties(document, 'Widget').quantity).toEqual({
      anyOf: [{ type: 'integer' }, { type: 'null' }],
    });
    expect(properties(document, 'WidgetCreateItem').quantity).toEqual({
      type: 'integer',
    });
  });

  it('suffixes a second version so two contracts over one name do not clobber each other', () => {
    expect(document.paths['/v2/widgets/search']).toBeDefined();
    expect(document.components.schemas.WidgetV2).toBeDefined();
    expect(document.paths['/v2/widgets/search']!.post!.operationId).toBe(
      'widgetV2Search',
    );
  });

  it('answers delete with null data because the row is gone', () => {
    const outcome = (
      document.paths['/widgets/delete']!.post!.responses['201'] as {
        content: {
          'application/json': {
            schema: {
              properties: {
                data: {
                  items: { oneOf: Array<{ properties: { data?: unknown } }> };
                };
              };
            };
          };
        };
      }
    ).content['application/json'].schema.properties.data.items.oneOf[0]!
      .properties.data;
    expect(outcome).toEqual({ type: 'null' });
  });
});
