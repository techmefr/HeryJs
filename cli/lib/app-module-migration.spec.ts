import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { migrateAppModuleWiring } from './app-module-migration';
import { declaredModules, undeclareModule } from './hery-config-patch';

const ROOT = path.join(__dirname, '..', '..');
const HAND_WIRED = readFileSync(
  path.join(
    __dirname,
    'fixtures',
    'app-module',
    'hand-wired.app.module.ts.txt',
  ),
  'utf8',
);
const CONFIG = readFileSync(path.join(ROOT, 'hery.config.ts'), 'utf8');
const WIRED = [
  'export',
  'impersonation',
  'mail',
  'oauth',
  'sse',
  'sso',
  'scim',
  'storage',
  'webhooks',
];

function handWiredProject(appModule = HAND_WIRED): string {
  const root = mkdtempSync(path.join(tmpdir(), 'hery-app-module-'));
  mkdirSync(path.join(root, 'src'));
  WIRED.forEach((name) =>
    mkdirSync(path.join(root, 'src', 'modules', name), { recursive: true }),
  );
  writeFileSync(path.join(root, 'src', 'app.module.ts'), appModule);
  writeFileSync(
    path.join(root, 'hery.config.ts'),
    WIRED.reduce(
      (config, name) => undeclareModule(config, `@heryjs/${name}`),
      CONFIG,
    ).replace(/^ {2}modules: \[\s*\],\n/m, ''),
  );

  return root;
}

function read(root: string, file: string): string {
  return readFileSync(path.join(root, file), 'utf8');
}

describe('migrateAppModuleWiring', () => {
  it('turns the hand-wired AppModule of 0.1 into the one this repository ships', () => {
    const root = handWiredProject();

    expect(read(root, 'hery.config.ts')).not.toContain('modules:');

    const result = migrateAppModuleWiring(root, ROOT, { write: true });

    expect(result.problems).toEqual([]);
    expect(read(root, 'src/app.module.ts')).toBe(
      read(ROOT, 'src/app.module.ts'),
    );
    expect(declaredModules(read(root, 'hery.config.ts'))).toEqual(
      WIRED.map((name) => `@heryjs/${name}`),
    );
    expect(read(root, 'hery.config.ts')).toBe(CONFIG);
    WIRED.forEach((name) => {
      expect(read(root, `src/modules/${name}/${name}.hery.ts`)).toBe(
        read(ROOT, `packages/${name}/src/runtime/${name}.hery.ts`),
      );
      expect(read(root, 'src/hery.modules.ts')).toContain(
        `from '#modules/${name}/${name}.hery';`,
      );
    });
  });

  it('keeps the project modules and providers AppModule wires itself', () => {
    const root = handWiredProject(
      HAND_WIRED.replace(
        "import { DomainExceptionFilter } from '@heryjs/core/errors';\n",
        "import { DomainExceptionFilter } from '@heryjs/core/errors';\nimport { BlogPostModule } from '#functional/blog-post/blog-post.module';\nimport { PeerGateway } from './peer.gateway';\n",
      )
        .replace(
          '    WebhooksModule,\n',
          '    WebhooksModule,\n    BlogPostModule,\n',
        )
        .replace('    AppService,\n', '    AppService,\n    PeerGateway,\n'),
    );

    migrateAppModuleWiring(root, ROOT, { write: true });

    const appModule = read(root, 'src/app.module.ts');
    expect(appModule).toContain(
      "import { BlogPostModule } from '#functional/blog-post/blog-post.module';",
    );
    expect(appModule).toContain(
      '  imports: [\n    HeryModule.forRoot(heryConfig, heryModules),\n    BlogPostModule,\n  ],',
    );
    expect(appModule).toContain(
      '  providers: [\n    AppService,\n    PeerGateway,\n  ],',
    );
    expect(appModule).not.toContain('#modules/');
  });

  it('changes nothing the second time', () => {
    const root = handWiredProject();
    migrateAppModuleWiring(root, ROOT, { write: true });

    expect(migrateAppModuleWiring(root, ROOT, { write: true })).toEqual({
      changed: [],
      problems: [],
    });
  });

  it('writes nothing under --check', () => {
    const root = handWiredProject();
    const result = migrateAppModuleWiring(root, ROOT, { write: false });

    expect(result.changed).toContain('src/app.module.ts');
    expect(read(root, 'src/app.module.ts')).toBe(HAND_WIRED);
    expect(existsSync(path.join(root, 'src', 'hery.modules.ts'))).toBe(false);
  });

  it('refuses an AppModule that leaves part of the kernel out', () => {
    const root = handWiredProject(
      HAND_WIRED.replace('    RateLimitModule,\n', ''),
    );

    expect(
      migrateAppModuleWiring(root, ROOT, { write: true }).problems,
    ).toEqual([
      'src/app.module.ts does not import RateLimitModule, which HeryModule always does',
    ]);
    expect(read(root, 'src/app.module.ts')).not.toContain('HeryModule');
  });

  it('refuses module options it cannot carry over', () => {
    const root = handWiredProject(
      HAND_WIRED.replace(
        'SsoModule.forRoot(),',
        'SsoModule.forRoot({ loginHandler: CustomHandler }),',
      ),
    );

    expect(
      migrateAppModuleWiring(root, ROOT, { write: true }).problems,
    ).toEqual([
      "SsoModule.forRoot({ loginHandler: CustomHandler }): pass these options as ['@heryjs/sso', { ... }] in hery.config.ts by hand",
    ]);
  });
});
