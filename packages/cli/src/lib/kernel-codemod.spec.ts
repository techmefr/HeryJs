import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as ts from 'typescript';
import {
  migrateKernelImports,
  rewriteKernelImports,
  rewriteTsconfigPaths,
  withKernelPeer,
} from './kernel-codemod';
import { rewriteKernelSpecifiers } from './runtime-copy';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

describe('the kernel import codemod', () => {
  it('rewrites each public entry and nothing else', () => {
    const source = [
      "import { DomainException } from '#kernel/public/errors';",
      'import type { RequestWithUser } from "#kernel/public/auth";',
      "import { ProbeException } from '#kernel/errors/probe.exception';",
      "import { thing } from '#kernel/public/unknown';",
      "jest.mock('#kernel/public/config');",
    ].join('\n');

    expect(rewriteKernelImports(source)).toBe(
      [
        "import { DomainException } from '@heryjs/core/errors';",
        'import type { RequestWithUser } from "@heryjs/core/auth";',
        "import { ProbeException } from '#kernel/errors/probe.exception';",
        "import { thing } from '#kernel/public/unknown';",
        "jest.mock('@heryjs/core/config');",
      ].join('\n'),
    );
  });

  it('maps @heryjs/core/* next to #kernel/*, in both layouts', () => {
    const inline =
      '{\n  "paths": {\n    "#kernel/*": ["../../src/technical/*"]\n  }\n}';
    const wrapped =
      '{\n  "paths": {\n    "#kernel/*": [\n      "../../src/technical/*"\n    ]\n  }\n}';

    expect(rewriteTsconfigPaths(inline)).toBe(
      '{\n  "paths": {\n    "@heryjs/core/*": ["../../src/technical/public/*"],\n    "#kernel/*": ["../../src/technical/*"]\n  }\n}',
    );
    expect(rewriteTsconfigPaths(wrapped)).toContain(
      '    "@heryjs/core/*": ["../../src/technical/public/*"],\n    "#kernel/*": [',
    );
  });

  it('declares the peer once, with the dev dependency a workspace range needs', () => {
    const manifest = `${JSON.stringify(
      { name: 'probe', peerDependencies: { zod: '^4.0.0' } },
      null,
      2,
    )}\n`;
    const once = withKernelPeer(manifest, 'workspace:^');

    expect(JSON.parse(once)).toEqual({
      name: 'probe',
      peerDependencies: { '@heryjs/core': 'workspace:^', zod: '^4.0.0' },
      devDependencies: { '@heryjs/core': 'workspace:*' },
    });
    expect(withKernelPeer(once, 'workspace:^')).toBe(once);
  });

  // The app imports the kernel through the package too, so the installed copy
  // keeps the specifier and reaches the very same classes.
  it('installs @heryjs/core imports unchanged', () => {
    expect(
      rewriteKernelSpecifiers("import { X } from '@heryjs/core/errors';"),
    ).toBe("import { X } from '@heryjs/core/errors';");
  });

  // What `pnpm run codemod:kernel` ran: run again over the same tree, it has
  // nothing left to do.
  it('leaves this repository unchanged when run a second time', () => {
    expect(
      migrateKernelImports(REPO_ROOT, ['packages', 'examples'], {
        peerRange: 'workspace:^',
        write: false,
      }),
    ).toEqual([]);
  });

  describe('on a module written before the package', () => {
    let projectDir: string;
    let packageDir: string;

    function write(relative: string, contents: string): void {
      const file = path.join(packageDir, relative);

      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, contents);
    }

    function compile(): string[] {
      const config = ts.getParsedCommandLineOfConfigFile(
        path.join(packageDir, 'tsconfig.json'),
        {},
        { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => undefined },
      );

      if (config === undefined) {
        return ['the tsconfig did not parse'];
      }

      const program = ts.createProgram(config.fileNames, config.options);

      return ts
        .getPreEmitDiagnostics(program)
        .map((diagnostic) =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
        );
    }

    beforeEach(() => {
      projectDir = mkdtempSync(path.join(tmpdir(), 'hery-kernel-migrate-'));
      packageDir = path.join(projectDir, 'packages', 'legacy');
      write(
        'package.json',
        `${JSON.stringify({ name: 'legacy', peerDependencies: { '@nestjs/common': '^12.0.0' } }, null, 2)}\n`,
      );
      write(
        'tsconfig.json',
        `${JSON.stringify(
          {
            extends: path.join(REPO_ROOT, 'tsconfig.json'),
            compilerOptions: {
              paths: {
                '#kernel/*': [path.join(REPO_ROOT, 'src', 'technical', '*')],
              },
              rootDir: path.parse(REPO_ROOT).root,
              typeRoots: [path.join(REPO_ROOT, 'node_modules', '@types')],
              types: ['node'],
              noEmit: true,
              incremental: false,
            },
            include: ['src'],
          },
          null,
          2,
        )}\n`,
      );
      write(
        'src/runtime/legacy.exception.ts',
        [
          "import { DomainException } from '#kernel/public/errors';",
          "import type { RequestWithUser } from '#kernel/public/auth';",
          '',
          'export class LegacyException extends DomainException {}',
          '',
          'export type LegacyRequest = RequestWithUser;',
          '',
        ].join('\n'),
      );
    });

    afterEach(() => {
      rmSync(projectDir, { recursive: true, force: true });
    });

    it('migrates, then changes nothing on a second run', () => {
      expect(
        migrateKernelImports(projectDir, ['packages'], {
          peerRange: '^1.0.0',
        }),
      ).toEqual([
        path.join('packages', 'legacy', 'package.json'),
        path.join(
          'packages',
          'legacy',
          'src',
          'runtime',
          'legacy.exception.ts',
        ),
        path.join('packages', 'legacy', 'tsconfig.json'),
      ]);
      expect(
        readFileSync(
          path.join(packageDir, 'src', 'runtime', 'legacy.exception.ts'),
          'utf8',
        ),
      ).toContain("from '@heryjs/core/errors'");
      expect(
        JSON.parse(readFileSync(path.join(packageDir, 'package.json'), 'utf8')),
      ).toEqual({
        name: 'legacy',
        peerDependencies: {
          '@heryjs/core': '^1.0.0',
          '@nestjs/common': '^12.0.0',
        },
      });

      expect(
        migrateKernelImports(projectDir, ['packages'], {
          peerRange: '^1.0.0',
        }),
      ).toEqual([]);
    });

    it('compiles once migrated', () => {
      migrateKernelImports(projectDir, ['packages']);

      expect(compile()).toEqual([]);
    }, 120_000);
  });
});
