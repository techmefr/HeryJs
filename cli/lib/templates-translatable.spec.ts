import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { loadBlueprint } from './blueprint';
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

function contextFor(fieldsYaml: string) {
  const dir = mkdtempSync(path.join(tmpdir(), 'hery-translatable-'));
  const file = path.join(dir, 'page.yaml');
  writeFileSync(
    file,
    `name: Page\nfields:\n${fieldsYaml}\nsorts:\n  - createdAt\n`,
  );

  return buildResourceContext(loadBlueprint(file));
}

const plain = contextFor('  - name: title\n    type: string');
const translated = contextFor(
  '  - name: title\n    type: string\n  - name: summary\n    type: string\n    optional: true\n    translatable: true',
);

describe('a resource with a translatable field', () => {
  it('stores the field as JSON', () => {
    expect(prismaModelBlock(translated)).toContain('summary Json?');
  });

  it('accepts one string or an object of locales on write', () => {
    expect(dtoFile(translated)).toContain(
      'summary: translatableInputSchema(z.string().min(1).max(255)).optional()',
    );
  });

  it('answers the resolved text and every translation', () => {
    const view = viewFile(translated);

    expect(view).toContain('summary: z.string().nullable()');
    expect(view).toContain(
      'summaryTranslations: z.record(z.string(), z.string())',
    );
    expect(view).toContain("withResolvedTranslations(record, ['summary'])");
  });

  it('declares the field translatable in the contract and describe', () => {
    const controller = controllerFile(translated);

    expect(controller).toContain("translatable: ['summary']");
    expect(controller).toContain('translatable: true');
    expect(controller).toContain('locales: describeLocales()');
    expect(controller).toContain("'summaryTranslations'");
  });

  it('settles filters, sorts and writes in the service', () => {
    const service = serviceFile(translated);

    expect(service).toContain('resolveTranslatableFilters');
    expect(service).toContain('searchSortedByTranslation');
    expect(service).toContain(
      'normalizeTranslatableWrite(data, TRANSLATABLE_FIELDS)',
    );
  });

  it('seeds the factory with the default locale', () => {
    expect(factoryFile(translated)).toContain('resolveDefaultLocale()');
  });

  it('generates a spec that exercises locales', () => {
    expect(specFile(translated)).toContain(
      "describe('translatable field summary'",
    );
  });
});

describe('a resource with no translatable field', () => {
  const outputs = [
    dtoFile(plain),
    viewFile(plain),
    controllerFile(plain),
    serviceFile(plain),
    factoryFile(plain),
    specFile(plain),
  ];

  it('generates nothing that mentions translations', () => {
    for (const output of outputs) {
      expect(output).not.toMatch(/ranslat/);
    }
  });
});
