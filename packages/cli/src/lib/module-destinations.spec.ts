import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { loadOfficialModules } from './module-discovery';
import { kernelWritesOf } from './module-destinations';
import { recordPatches } from './module-patches';

function packageWith(runtimeFiles: string[]): string {
  const packageDir = mkdtempSync(path.join(tmpdir(), 'hery-dest-'));

  for (const file of runtimeFiles) {
    const full = path.join(packageDir, 'src', 'runtime', file);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, '');
  }

  return packageDir;
}

describe('module destinations', () => {
  it('keeps every official module out of src/technical', async () => {
    const problems: string[] = [];

    for (const module of loadOfficialModules()) {
      problems.push(...kernelWritesOf(module, await recordPatches(module)));
    }

    expect(problems).toEqual([]);
  });

  it.each(['graphql', 'mcp', 'search-elasticsearch', 'search-meilisearch'])(
    'installs %s under src/modules',
    (name) => {
      expect(
        loadOfficialModules().find((module) => module.name === name)?.dest,
      ).toBe(`src/modules/${name}`);
    },
  );

  it('refuses a dest inside the kernel', () => {
    expect(
      kernelWritesOf(
        {
          name: 'search-x',
          dest: 'src/technical/search',
          packageDir: packageWith(['driver.ts']),
        },
        [],
      ),
    ).toEqual([
      'search-x: dest "src/technical/search" is inside src/technical',
    ]);
  });

  it('refuses a runtime file that lands in the kernel from a wider dest', () => {
    expect(
      kernelWritesOf(
        {
          name: 'wide',
          dest: 'src',
          packageDir: packageWith([
            'modules/wide/wide.module.ts',
            'technical/errors/wide.exception.ts',
          ]),
        },
        [],
      ),
    ).toEqual([
      'wide: installs src/technical/errors/wide.exception.ts inside src/technical',
    ]);
  });

  it('refuses a patch of a kernel file', () => {
    expect(
      kernelWritesOf(
        {
          name: 'patcher',
          dest: 'src/modules/patcher',
          packageDir: packageWith([]),
        },
        [
          {
            module: 'patcher',
            file: 'src/technical/prisma/prisma.client.ts',
            marks: [],
          },
          { module: 'patcher', file: 'prisma/schema.prisma', marks: [] },
        ],
      ),
    ).toEqual([
      'patcher: patches src/technical/prisma/prisma.client.ts inside src/technical',
    ]);
  });
});
