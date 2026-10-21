import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { loadBlueprint } from './blueprint';
import { buildOpenApiDocument } from './openapi';
import { buildResourceContext } from './resource-context';
import {
  controllerFile,
  dtoFile,
  prismaModelBlock,
  serviceFile,
  specFile,
  viewFile,
} from './templates';

function blueprintFile(yaml: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'hery-richtext-'));
  const file = path.join(dir, 'page.yaml');
  writeFileSync(file, yaml);

  return file;
}

const BASE = `
name: Page
fields:
  - name: title
    type: string
  - name: body
    type: richtext
    optional: true
    maxLength: 5000
    allow:
      tags: [p, strong, a]
      attributes:
        a: [href]
      schemes: [https]
sorts:
  - createdAt
`;

const ctx = buildResourceContext(loadBlueprint(blueprintFile(BASE)));

function refused(yaml: string): string {
  try {
    loadBlueprint(blueprintFile(yaml));
  } catch (error) {
    return (error as Error).message;
  }

  return '';
}

describe('a blueprint with a richtext field', () => {
  it('loads with its size limit and allow-list', () => {
    expect(ctx.fields.find((field) => field.name === 'body')).toMatchObject({
      type: 'richtext',
      maxLength: 5000,
      allow: { tags: ['p', 'strong', 'a'], schemes: ['https'] },
    });
  });

  it.each([
    [
      'a script tag in the allow-list',
      BASE.replace('[p, strong, a]', '[p, script]'),
      /allow\.tags cannot contain/,
    ],
    [
      'an event handler attribute',
      BASE.replace('a: [href]', 'a: [href, onclick]'),
      /cannot contain an event handler/,
    ],
    [
      'the style attribute',
      BASE.replace('a: [href]', 'p: [style]'),
      /cannot contain an event handler \(on\*\), style or srcdoc/,
    ],
    [
      'the javascript scheme',
      BASE.replace('[https]', '[https, javascript]'),
      /allow\.schemes cannot contain/,
    ],
    [
      'a sort on the field',
      BASE.replace('  - createdAt', '  - createdAt\n  - body'),
      /names a richtext field/,
    ],
    [
      'a filter on the field',
      `${BASE}filters:\n  - body\n`,
      /names a richtext field/,
    ],
    [
      'a translatable field',
      BASE.replace('maxLength: 5000', 'translatable: true'),
      /cannot be translatable or revealed/,
    ],
    [
      'an unrouted resource',
      BASE.replace('name: Page', 'name: Page\nrouted: false'),
      /needs a routed resource/,
    ],
    [
      'maxLength on a string field',
      BASE.replace('type: string', 'type: string\n    maxLength: 10'),
      /only apply to a richtext field/,
    ],
  ])('refuses %s', (_name, yaml, message) => {
    expect(refused(yaml)).toMatch(message);
  });
});

describe('the code generated for a richtext field', () => {
  it('stores text', () => {
    expect(prismaModelBlock(ctx)).toContain('body String?');
  });

  it('limits the input, and keeps the spec of each field in the dto', () => {
    const dto = dtoFile(ctx);

    expect(dto).toContain('body: z.string().min(1).max(5000).optional()');
    expect(dto).toContain('export const RICHTEXT_FIELDS');
    expect(dto).toContain('"schemes":["https"]');
  });

  it('sanitises on create, update and restore, and again on read', () => {
    const service = serviceFile(ctx);

    expect(service).toContain(
      'data = sanitizeRichtextWrite(data, RICHTEXT_FIELDS)',
    );
    expect(service).toContain(
      'patch = patch && sanitizeRichtextWrite(patch, RICHTEXT_FIELDS)',
    );
    expect(viewFile(ctx)).toContain(
      'sanitizeRichtextRead(record, RICHTEXT_FIELDS)',
    );
  });

  it('publishes the limit and the resolved allow-list', () => {
    expect(controllerFile(ctx)).toContain(
      "richtext: describeRichtext(RICHTEXT_FIELDS, 'body')",
    );
  });

  it('proves the XSS payloads stripped, on write, update and read', () => {
    const spec = specFile(ctx);

    expect(spec).toContain("describe('richtext field body'");
    expect(spec).toContain('javascript:alert(1)');
    expect(spec).toContain('onerror=alert(1)');
    expect(spec).toContain('strips every XSS payload on write');
    expect(spec).toContain(
      'a row written past the service is sanitised on read',
    );
    expect(spec).toContain('refuses more than 5000 characters');
  });

  it('leaves a resource with no richtext field exactly as it was', () => {
    const plain = buildResourceContext(
      loadBlueprint(
        blueprintFile(
          'name: Page\nfields:\n  - name: title\n    type: string\n',
        ),
      ),
    );

    expect(serviceFile(plain)).not.toContain('ichtext');
    expect(dtoFile(plain)).not.toContain('ichtext');
    expect(specFile(plain)).not.toContain('ichtext');
  });
});

describe('the contract published for a richtext field', () => {
  const document = buildOpenApiDocument([ctx]) as {
    components: { schemas: Record<string, Record<string, unknown>> };
  };
  const schemas = JSON.stringify(document.components.schemas);

  it('is a string with the html format, in the record and on create', () => {
    expect(schemas).toContain('"format":"html"');
    expect(schemas).toContain('"maxLength":5000');
  });

  it('describes the allow-list', () => {
    expect(schemas).toContain('"richtext"');
    expect(schemas).toContain('"schemes"');
  });
});
