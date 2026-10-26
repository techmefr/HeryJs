import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { loadBlueprint } from './blueprint';
import { buildResourceContext } from './resource-context';
import { withoutSetEntries } from './strip-example';
import { dtoFile, prismaModelBlock, specFile, viewFile } from './templates';

function load(yaml: string) {
  const dir = mkdtempSync(path.join(tmpdir(), 'hery-encrypted-'));
  const file = path.join(dir, 'vault-item.yaml');
  writeFileSync(file, yaml);

  return loadBlueprint(file);
}

const SEALED = `
name: VaultItem
fields:
  - name: label
    type: string
  - name: token
    type: encrypted
    optional: true
`;

describe('encrypted blueprint fields', () => {
  it('are hidden from every response unless the blueprint reveals them', () => {
    const blueprint = load(SEALED);
    const token = blueprint.fields.find((field) => field.name === 'token');

    expect(token?.hidden).toBe(true);
    expect(viewFile(buildResourceContext(blueprint))).not.toMatch(/token: z/);
  });

  it('come back decrypted when the blueprint reveals them', () => {
    const blueprint = load(`${SEALED}    reveal: true\n`);
    const context = buildResourceContext(blueprint);

    expect(
      blueprint.fields.find((field) => field.name === 'token')?.hidden,
    ).toBe(false);
    expect(viewFile(context)).toContain('token: z.string()');
  });

  it('are plain text columns and a bounded string on the way in', () => {
    const context = buildResourceContext(load(SEALED));

    expect(prismaModelBlock(context)).toContain('token String?');
    expect(dtoFile(context)).toContain(
      'token: z.string().min(1).max(4096).optional()',
    );
  });

  it('get a generated spec that checks the column is sealed', () => {
    const spec = specFile(buildResourceContext(load(SEALED)));

    expect(spec).toContain('stores token sealed and never returns it');
    expect(spec).toContain('/^enc:/');
  });

  it('cannot be filtered on', () => {
    expect(() => load(`${SEALED}filters: [token]\n`)).toThrow(
      /filter "token" names an encrypted field/,
    );
  });

  it('cannot be sorted on', () => {
    expect(() => load(`${SEALED}sorts: [token]\n`)).toThrow(
      /sort "token" names an encrypted field/,
    );
  });

  it('refuse reveal on a field that is not encrypted', () => {
    expect(() =>
      load(`
name: VaultItem
fields:
  - name: label
    type: string
    reveal: true
`),
    ).toThrow(/sets reveal but is not encrypted/);
  });

  it('refuse reveal together with hidden', () => {
    expect(() => load(`${SEALED}    reveal: true\n    hidden: true\n`)).toThrow(
      /cannot be both hidden and revealed/,
    );
  });

  it('are removed with their model when the demo is stripped', () => {
    const source =
      "const ENCRYPTED_COLUMNS = new Set<string>(['BlogPost.privateNote', 'Vault.token']);";

    expect(
      withoutSetEntries(source, 'ENCRYPTED_COLUMNS', new Set(['BlogPost'])),
    ).toBe("const ENCRYPTED_COLUMNS = new Set<string>(['Vault.token']);");
  });
});
