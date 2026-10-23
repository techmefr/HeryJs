import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { cliDependency, withKernelPackage } from './kernel-dependency';
import { installedKernelSchema, syncKernelSchema } from './kernel-sync';
import { KERNEL_SCHEMA } from './schema-patch';

const ROOT = path.resolve(__dirname, '..', '..');

describe('hery sync', () => {
  it("leaves this repository's _hery/core.prisma as it is", () => {
    expect(
      syncKernelSchema(ROOT, installedKernelSchema(ROOT), { write: false }),
    ).toBe(false);
  });

  it('reads the schema from the installed @heryjs/core', () => {
    expect(installedKernelSchema(ROOT)).toBe(
      readFileSync(
        path.join(ROOT, 'packages', 'core', 'prisma', 'core.prisma'),
        'utf8',
      ),
    );
  });

  describe('in a project', () => {
    let root: string;

    beforeEach(() => {
      root = mkdtempSync(path.join(tmpdir(), 'hery-sync-'));
      mkdirSync(path.join(root, path.dirname(KERNEL_SCHEMA)), {
        recursive: true,
      });
    });

    afterEach(() => rmSync(root, { recursive: true, force: true }));

    const packaged = 'model User {\n  id   String @id\n  role String?\n}\n';

    it('writes the kernel schema and keeps the relations the project added', () => {
      writeFileSync(
        path.join(root, KERNEL_SCHEMA),
        'model User {\n  id    String @id\n  notes Note[]\n}\n',
      );

      expect(syncKernelSchema(root, packaged, { write: true })).toBe(true);

      const written = readFileSync(path.join(root, KERNEL_SCHEMA), 'utf8');

      expect(written).toContain('  role String?');
      expect(written).toContain('  notes Note[]');
      expect(syncKernelSchema(root, packaged, { write: false })).toBe(false);
    });

    it('only reports a schema that is behind when asked to check', () => {
      writeFileSync(
        path.join(root, KERNEL_SCHEMA),
        'model User {\n  id String @id\n}\n',
      );

      expect(syncKernelSchema(root, packaged, { write: false })).toBe(true);
      expect(
        readFileSync(path.join(root, KERNEL_SCHEMA), 'utf8'),
      ).not.toContain('role');
    });
  });
});

describe('the @heryjs/cli dependency of a project', () => {
  it('sits next to the kernel it was built with', () => {
    expect(cliDependency('file:/repo/packages/core')).toBe(
      `file:${path.join('/repo', 'packages', 'cli')}`,
    );
  });

  it('takes the kernel range once both are published', () => {
    expect(cliDependency('^1.0.0')).toBe('^1.0.0');
  });

  it('replaces the workspace range of the framework manifest', () => {
    const manifest = withKernelPackage(
      { devDependencies: { '@heryjs/cli': 'workspace:*' } },
      'file:/repo/packages/core',
    );

    expect(manifest.devDependencies?.['@heryjs/cli']).toBe(
      `file:${path.join('/repo', 'packages', 'cli')}`,
    );
  });
});
