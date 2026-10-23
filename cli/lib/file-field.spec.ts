import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { loadBlueprint } from './blueprint';
import { buildResourceContext } from './resource-context';
import { dtoFile, specFile } from './templates';

function load(yaml: string) {
  const dir = mkdtempSync(path.join(tmpdir(), 'hery-file-'));
  const file = path.join(dir, 'avatar.yaml');
  writeFileSync(file, yaml);

  return loadBlueprint(file);
}

const AVATAR = `
name: Avatar
erasure: delete
fields:
  - name: label
    type: string
  - name: picture
    type: file
`;

describe('file blueprint fields', () => {
  it("refuse on the way in a key outside the caller's tenant", () => {
    const dto = dtoFile(buildResourceContext(load(AVATAR)));

    expect(dto).toContain(
      "import { isCurrentTenantFileKey } from '@heryjs/core/tenancy';",
    );
    expect(dto).toContain(
      'picture: z.string().min(1).max(255).refine(isCurrentTenantFileKey),',
    );
  });

  it('get a generated spec whose sample keys sit under the tenant it writes in', () => {
    const spec = specFile(buildResourceContext(load(AVATAR)));

    expect(spec).toContain("picture: 'default/picture-key.png'");
    expect(spec).toContain('picture: `${tenantId}/picture-key.png`');
  });
});
