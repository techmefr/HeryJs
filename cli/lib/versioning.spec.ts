import { buildResourceContext } from './resource-context';
import type { Blueprint } from './blueprint';

function blueprint(overrides: Partial<Blueprint> = {}): Blueprint {
  return {
    name: 'BlogPost',
    routed: true,
    version: 1,
    softDeletes: true,
    fields: [{ name: 'title', type: 'string', optional: false }],
    permissions: {},
    sorts: [],
    filters: [],
    includes: [],
    aggregates: [],
    relations: [],
    ...overrides,
  } as unknown as Blueprint;
}

describe('resource versioning', () => {
  /**
   * Version 1 keeps the unprefixed path every existing project already
   * publishes. Prefixing it would have renamed every route in every generated
   * app to introduce a feature none of them use yet.
   */
  it('leaves version 1 where it has always been', () => {
    const ctx = buildResourceContext(blueprint());

    expect(ctx.routePath).toBe('blog-posts');
    expect(ctx.version).toBe(1);
  });

  it('mounts a later version under its own prefix', () => {
    expect(buildResourceContext(blueprint({ version: 2 })).routePath).toBe(
      'v2/blog-posts',
    );
  });

  it('serves its own model by default', () => {
    const ctx = buildResourceContext(blueprint());

    expect(ctx.modelPascalName).toBe('BlogPost');
    expect(ctx.modelCamelName).toBe('blogPost');
    expect(ctx.ownsModel).toBe(true);
  });

  /**
   * The point of the model key: a second version of a contract is a second
   * resource over the *same* table. Without it the v2 blueprint would declare
   * a BlogPostV2 model and the generator would emit a duplicate of a table
   * that already exists.
   */
  it('reads and writes the named model when serving another resource contract', () => {
    const ctx = buildResourceContext(
      blueprint({
        name: 'BlogPostV2',
        version: 2,
        model: 'BlogPost',
      }),
    );

    expect(ctx.pascalName).toBe('BlogPostV2');
    expect(ctx.modelCamelName).toBe('blogPost');
    expect(ctx.routePath).toBe('v2/blog-post-v2s');
  });

  // ownsModel is what generate.ts reads before touching prisma/schema.prisma,
  // TENANT_SCOPED_MODELS and AUDITED_MODELS. Getting it wrong duplicates a
  // table rather than failing loudly.
  it('reports that it owns no schema when it borrows a model', () => {
    const ctx = buildResourceContext(
      blueprint({
        name: 'BlogPostV2',
        model: 'BlogPost',
      }),
    );

    expect(ctx.ownsModel).toBe(false);
  });
});
