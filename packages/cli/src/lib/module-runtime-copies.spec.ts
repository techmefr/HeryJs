import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import {
  copyModuleRuntimes,
  withCopiedModuleMapper,
  withCopiedModuleRuntimes,
  withListedHeryModules,
  workspaceModules,
} from './module-runtime-copies';

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const REPO_MANIFEST = JSON.parse(
  readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
) as {
  dependencies: Record<string, string>;
  imports: Record<string, unknown>;
  jest: { moduleNameMapper: Record<string, string> };
};

describe("this repository's modules", () => {
  it('come from their workspace packages, not from a copy', () => {
    const modules = workspaceModules(REPO_MANIFEST.dependencies);

    expect(modules).toEqual(expect.arrayContaining(['impersonation', 'sso']));
    expect(modules).not.toContain('core');
    expect(modules).not.toContain('cli');
    expect(REPO_MANIFEST.imports['#modules/*']).toBe('@heryjs/*');

    for (const name of modules) {
      expect(
        existsSync(
          path.join(ROOT, 'src', 'modules', name, `${name}.module.ts`),
        ),
      ).toBe(false);
    }
  });
});

describe('a generated project', () => {
  it('reads its modules from the copied runtime', () => {
    const manifest = withCopiedModuleRuntimes(REPO_MANIFEST);

    expect(workspaceModules(manifest.dependencies)).toEqual([]);
    expect(manifest.dependencies['@heryjs/core']).toBe('workspace:*');
    expect(manifest.imports['#modules/*']).toEqual({
      types: './src/modules/*.ts',
      development: './src/modules/*.ts',
      default: './dist/src/modules/*.js',
    });
    expect(manifest.jest.moduleNameMapper['^#modules/(.*)$']).toBe(
      '<rootDir>/src/modules/$1',
    );
    expect(
      Object.keys(manifest.jest.moduleNameMapper).filter((pattern) =>
        pattern.startsWith('^@heryjs/(?!'),
      ),
    ).toEqual([]);
  });

  it('keeps the prefix of a jest config that is not at the root', () => {
    expect(
      withCopiedModuleMapper({
        '^#modules/([^/]+)/(.*)$': '<rootDir>/../packages/$1/src/runtime/$2',
        '^#functional/(.*)$': '<rootDir>/../src/functional/$1',
      }),
    ).toEqual({
      '^#modules/(.*)$': '<rootDir>/../src/modules/$1',
      '^#functional/(.*)$': '<rootDir>/../src/functional/$1',
    });
  });

  it('hands HeryModule the contracts it lists', () => {
    const source = withListedHeryModules(
      readFileSync(path.join(ROOT, 'src', 'app.module.ts'), 'utf8'),
    );

    expect(source).toContain('HeryModule.forRoot(heryConfig, heryModules)');
    expect(source).toContain("import { heryModules } from './hery.modules';");
    expect(withListedHeryModules(source)).toBe(source);
  });

  it('gets the runtime of each module copied in', () => {
    const dest = mkdtempSync(path.join(tmpdir(), 'hery-runtimes-'));

    try {
      copyModuleRuntimes(ROOT, dest, ['sse']);

      expect(
        existsSync(path.join(dest, 'src', 'modules', 'sse', 'sse.hery.ts')),
      ).toBe(true);
    } finally {
      rmSync(dest, { recursive: true, force: true });
    }
  });
});
