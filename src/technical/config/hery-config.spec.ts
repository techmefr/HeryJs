import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { assertHeryConfigChoices, loadHeryConfig } from './hery-config';
import type { HeryConfig } from './hery-config.types';

describe('loadHeryConfig', () => {
  it('reads and transpiles the real hery.config.ts at the project root', () => {
    const config = loadHeryConfig();

    expect(config.search?.default).toBe('prisma');
    expect(config.search?.engines.prisma).toEqual({ driver: 'prisma' });
  });

  describe('in production', () => {
    let root: string;
    const nodeEnv = process.env.NODE_ENV;

    beforeEach(() => {
      root = mkdtempSync(path.join(tmpdir(), 'hery-config-'));
      mkdirSync(path.join(root, 'dist'));
      jest.spyOn(process, 'cwd').mockReturnValue(root);
      process.env.NODE_ENV = 'production';
    });

    afterEach(() => {
      process.env.NODE_ENV = nodeEnv;
      jest.restoreAllMocks();
      rmSync(root, { recursive: true, force: true });
    });

    it('reads the config the build compiled, never the TypeScript source', () => {
      writeFileSync(
        path.join(root, 'dist', 'hery.config.js'),
        "exports.default = { modules: ['@heryjs/compiled'] };\n",
      );
      writeFileSync(path.join(root, 'hery.config.ts'), 'not TypeScript at all');

      expect(loadHeryConfig().modules).toEqual(['@heryjs/compiled']);
    });

    it('says the build did not compile it when it is missing', () => {
      expect(() => loadHeryConfig()).toThrow(/dist\/hery\.config\.js/);
    });
  });
});

describe('assertHeryConfigChoices', () => {
  it('accepts every declared value and an absent one', () => {
    expect(() => assertHeryConfigChoices({})).not.toThrow();
    expect(() =>
      assertHeryConfigChoices({
        sharing: { onGrantorErasure: 'keep' },
        admin: { studioAccess: 'tenant-admin' },
      }),
    ).not.toThrow();
    expect(() =>
      assertHeryConfigChoices({
        sharing: { onGrantorErasure: 'revoke' },
        admin: { studioAccess: 'operator' },
      }),
    ).not.toThrow();
  });

  it('stops the boot on a value outside the choices, naming the key', () => {
    const config = {
      sharing: { onGrantorErasure: 'archive' },
      admin: { studioAccess: 'everyone' },
    } as unknown as HeryConfig;

    expect(() => assertHeryConfigChoices(config)).toThrow(
      /sharing\.onGrantorErasure: "archive"[\s\S]*admin\.studioAccess: "everyone"/,
    );
  });
});
