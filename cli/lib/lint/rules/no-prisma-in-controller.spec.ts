import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { noPrismaInControllerRule } from './no-prisma-in-controller';

function projectWithController(source: string): string {
  const root = mkdtempSync(path.join(tmpdir(), 'hery-lint-'));
  const dir = path.join(root, 'src', 'functional', 'note');

  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'note.controller.ts'), source);

  return root;
}

describe('no-prisma-in-controller', () => {
  it.each(['#technical/prisma/prisma.client', '@heryjs/core/database'])(
    'flags the tenant-scoped client imported from %s',
    (specifier) => {
      const root = projectWithController(
        `import { PRISMA_CLIENT } from '${specifier}';\n`,
      );

      expect(
        noPrismaInControllerRule.run(root).map((violation) => violation.line),
      ).toEqual([1]);
    },
  );

  it('lets a type-only import of the client through', () => {
    const root = projectWithController(
      "import type { TenantScopedPrismaClient } from '@heryjs/core/database';\n",
    );

    expect(noPrismaInControllerRule.run(root)).toEqual([]);
  });
});
