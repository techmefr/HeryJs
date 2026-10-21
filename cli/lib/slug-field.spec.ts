import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { loadBlueprint } from './blueprint';
import { buildOpenApiDocument } from './openapi';
import { buildResourceContext } from './resource-context';
import {
  controllerFile,
  dtoFile,
  factoryFile,
  prismaModelBlock,
  serviceFile,
  specFile,
  viewFile,
} from './templates';

function blueprintFile(yaml: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'hery-slug-'));
  const file = path.join(dir, 'page.yaml');
  writeFileSync(file, yaml);

  return file;
}

const FIELDS = `
name: Page
fields:
  - name: title
    type: string
  - name: slug
    type: slug
    source: title
filters:
  - slug
sorts:
  - createdAt
`;

const ctx = buildResourceContext(loadBlueprint(blueprintFile(FIELDS)));
const stableCtx = buildResourceContext(
  loadBlueprint(
    blueprintFile(
      FIELDS.replace('source: title', 'source: title\n    stable: true'),
    ),
  ),
);

function refused(yaml: string): string {
  try {
    loadBlueprint(blueprintFile(yaml));
  } catch (error) {
    return (error as Error).message;
  }

  return '';
}

describe('a blueprint with a slug field', () => {
  it('loads, and keeps the source and stability of the field', () => {
    const field = ctx.fields.find((entry) => entry.name === 'slug');

    expect(field).toMatchObject({ type: 'slug', source: 'title' });
    expect(
      stableCtx.fields.find((entry) => entry.name === 'slug')?.stable,
    ).toBe(true);
  });

  it.each([
    [
      'a source that names no string field',
      FIELDS.replace('source: title', 'source: missing'),
      /needs a source naming a declared string field/,
    ],
    [
      'an optional source',
      FIELDS.replace('type: string', 'type: string\n    optional: true'),
      /required, visible and not translatable/,
    ],
    [
      'a hidden source',
      FIELDS.replace('type: string', 'type: string\n    hidden: true'),
      /required, visible and not translatable/,
    ],
    [
      'a translatable source',
      FIELDS.replace('type: string', 'type: string\n    translatable: true'),
      /required, visible and not translatable/,
    ],
    [
      'an optional slug',
      FIELDS.replace('source: title', 'source: title\n    optional: true'),
      /optional\/hidden\/translatable\/reveal must not be declared/,
    ],
    [
      'a hidden slug',
      FIELDS.replace('source: title', 'source: title\n    hidden: true'),
      /optional\/hidden\/translatable\/reveal must not be declared/,
    ],
    [
      'stable on a field that is not a slug',
      FIELDS.replace('type: string', 'type: string\n    stable: true'),
      /declares stable, which only applies to a slug field/,
    ],
    [
      'an unrouted resource',
      FIELDS.replace('name: Page', 'name: Page\nrouted: false'),
      /needs a routed resource/,
    ],
  ])('refuses %s', (_name, yaml, message) => {
    expect(refused(yaml)).toMatch(message);
  });
});

describe('the code generated for a slug field', () => {
  it('stores a unique per-tenant column that still has a value when written past the service', () => {
    const block = prismaModelBlock(ctx);

    expect(block).toContain('slug String @default(cuid())');
    expect(block).toContain('@@unique([tenantId, slug])');
  });

  it('never requires the slug on the way in, and always returns it', () => {
    expect(dtoFile(ctx)).toMatch(/slug: z\s*\.string\(\)[\s\S]*\.optional\(\)/);
    expect(dtoFile(ctx)).toContain('a-z0-9');
    expect(viewFile(ctx)).toMatch(/slug: z\s*\.string\(\)/);
    expect(viewFile(ctx)).not.toMatch(/slug: [^\n]*nullable/);
  });

  it('derives the slug in the service on create, update and restore', () => {
    const service = serviceFile(ctx);

    expect(service).toContain(
      "{ name: 'slug', source: 'title', stable: false }",
    );
    expect(service.match(/withSlugRetry\(/g)).toHaveLength(3);
    expect(serviceFile(stableCtx)).toContain('stable: true');
  });

  it('describes the field with its source and stability', () => {
    expect(controllerFile(ctx)).toContain(
      "slug: { source: 'title', stable: false }",
    );
    expect(controllerFile(ctx)).toContain("'slug'");
  });

  it('gives the factory a valid slug of its own', () => {
    expect(factoryFile(ctx)).toContain('faker.lorem.slug(3)');
  });

  it('proves derivation, numbering, races, lookup and update in the generated suite', () => {
    const spec = specFile(ctx);

    expect(spec).toContain("describe('slug field slug'");
    expect(spec).toContain("'twin-' + marker + '-2'");
    expect(spec).toContain(
      'stays unique when the same source is created concurrently',
    );
    expect(spec).toContain("key: 'slug.taken'");
    expect(spec).toContain("field: 'slug', value: 'lookup-' + marker");
    expect(spec).toContain("toBe('after-' + marker)");
    expect(specFile(stableCtx)).toContain("toBe('before-' + marker)");
  });

  it('leaves a resource with no slug field exactly as it was', () => {
    const plain = buildResourceContext(
      loadBlueprint(
        blueprintFile(
          'name: Page\nfields:\n  - name: title\n    type: string\n',
        ),
      ),
    );

    expect(serviceFile(plain)).not.toContain('slug');
    expect(specFile(plain)).not.toContain('slug');
    expect(prismaModelBlock(plain)).not.toContain('@@unique');
  });
});

describe('the contract published for a slug field', () => {
  const document = buildOpenApiDocument([ctx]) as {
    components: { schemas: Record<string, Record<string, unknown>> };
  };
  const schemas = JSON.stringify(document.components.schemas);

  it('shows the pattern and says it is optional on create', () => {
    const create = JSON.stringify(
      document.components.schemas['PageCreateItem'] ?? {},
    );

    expect(schemas).toContain('^[a-z0-9]+(?:-[a-z0-9]+)*$');
    expect(create).not.toContain('"required":["title","slug"]');
    expect(create).toContain('"required":["title"]');
  });

  it('describes the slug type and its source', () => {
    expect(schemas).toContain('"slug"');
    expect(schemas).toContain('stable');
  });
});
