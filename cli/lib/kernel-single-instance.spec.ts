import { spawnSync } from 'node:child_process';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

// Run by Node itself rather than inside jest: jest maps @heryjs/core/* onto the
// sources, so only a real resolution through node_modules and the package's
// exports can show that the app and a module reach the same files.
const PROBE = `
const { createRequire } = require('node:module');
const path = require('node:path');
const { Test } = require('@nestjs/testing');

const root = process.cwd();
const importers = {
  app: path.join(root, 'src', 'app.module.ts'),
  installedModule: path.join(root, 'src', 'modules', 'storage', 'storage.module.ts'),
  modulePackage: path.join(root, 'packages', 'storage', 'src', 'runtime', 'storage.module.ts'),
};
const load = (from, entry) => createRequire(from)('@heryjs/core/' + entry);

(async () => {
  const report = {};

  for (const [name, from] of Object.entries(importers)) {
    const app = { database: load(importers.app, 'database'), capabilities: load(importers.app, 'capabilities') };
    const other = { database: load(from, 'database'), capabilities: load(from, 'capabilities') };
    const prisma = { tenant: 'probe' };
    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: app.database.PRISMA_CLIENT, useValue: prisma },
        { provide: app.capabilities.CapabilitiesService, useValue: prisma },
      ],
    }).compile();

    report[name] = {
      resolved: path.relative(root, require('node:fs').realpathSync(createRequire(from).resolve('@heryjs/core/tenancy'))),
      sameTenantContext:
        load(importers.app, 'tenancy').TenantContextStorage === load(from, 'tenancy').TenantContextStorage,
      sameToken: moduleRef.get(other.database.PRISMA_CLIENT) === prisma,
      sameClass: moduleRef.get(other.capabilities.CapabilitiesService) === prisma,
    };
  }

  process.stdout.write(JSON.stringify(report), () => process.exit(0));
})().catch((error) => {
  process.stderr.write(String(error && error.stack));
  process.exit(1);
});
`;

describe('one instance of the kernel', () => {
  it('gives the app, an installed module and a module package the same classes', () => {
    const run = spawnSync(
      process.execPath,
      [
        '--conditions=development',
        '--conditions=heryjs-source',
        '-r',
        'ts-node/register/transpile-only',
        '-e',
        PROBE,
      ],
      { cwd: REPO_ROOT, encoding: 'utf8', env: process.env, timeout: 50000 },
    );

    expect([run.status, run.status === 0 ? '' : run.stderr]).toEqual([0, '']);

    const sameEverything = {
      resolved: path.join('src', 'technical', 'public', 'tenancy.ts'),
      sameTenantContext: true,
      sameToken: true,
      sameClass: true,
    };

    expect(JSON.parse(run.stdout)).toEqual({
      app: sameEverything,
      installedModule: sameEverything,
      modulePackage: sameEverything,
    });
  }, 60000);
});
