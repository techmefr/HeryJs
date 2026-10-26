import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import {
  DEFAULT_CORS_ALLOWED_HEADERS,
  loadCorsConfig,
  resolveCorsOptions,
  withOriginsFromEnv,
} from './cors';

describe('cors configuration', () => {
  it('sends no header when no origin is declared', () => {
    expect(resolveCorsOptions({ origins: [] }, 'production')).toBe(false);
    expect(resolveCorsOptions(null, 'development')).toBe(false);
  });

  it('refuses any origin in production', () => {
    expect(() => resolveCorsOptions({ origins: ['*'] }, 'production')).toThrow(
      /cors\.config\.ts/,
    );
  });

  it('allows any origin outside production', () => {
    expect(resolveCorsOptions({ origins: ['*'] }, 'development')).toMatchObject(
      {
        origin: '*',
        credentials: false,
      },
    );
  });

  it('refuses any origin together with credentials, which browsers reject', () => {
    expect(() =>
      resolveCorsOptions({ origins: ['*'], credentials: true }, 'development'),
    ).toThrow(/credentials/);
  });

  it('passes the declared origins through, and allows the Bearer header by default', () => {
    const options = resolveCorsOptions(
      { origins: ['https://app.example.com'], credentials: true },
      'production',
    );

    expect(options).toMatchObject({
      origin: ['https://app.example.com'],
      credentials: true,
      allowedHeaders: DEFAULT_CORS_ALLOWED_HEADERS,
    });
  });

  it('reads the file this repository ships, and it is one production refuses as it stands', () => {
    const config = loadCorsConfig();

    expect(config?.origins).toEqual(['*']);
    expect(resolveCorsOptions(config, 'development')).toMatchObject({
      origin: '*',
    });
    expect(() => resolveCorsOptions(config, 'production')).toThrow();
  });

  it('lets CORS_ORIGINS replace the origins of the file, which is how production gets off "*"', () => {
    const config = withOriginsFromEnv(loadCorsConfig(), [
      'https://app.example.com',
    ]);

    expect(resolveCorsOptions(config, 'production')).toMatchObject({
      origin: ['https://app.example.com'],
    });
  });

  it('keeps the file as it stands when CORS_ORIGINS is unset', () => {
    const config = loadCorsConfig();

    expect(withOriginsFromEnv(config, undefined)).toBe(config);
  });

  it('turns CORS off when CORS_ORIGINS is set to nothing, even without a file', () => {
    expect(resolveCorsOptions(withOriginsFromEnv(null, []), 'production')).toBe(
      false,
    );
  });

  describe('in production', () => {
    let root: string;
    const nodeEnv = process.env.NODE_ENV;

    beforeEach(() => {
      root = mkdtempSync(path.join(tmpdir(), 'cors-config-'));
      jest.spyOn(process, 'cwd').mockReturnValue(root);
      process.env.NODE_ENV = 'production';
    });

    afterEach(() => {
      process.env.NODE_ENV = nodeEnv;
      jest.restoreAllMocks();
      rmSync(root, { recursive: true, force: true });
    });

    it('reads the file the build compiled, never the TypeScript source', () => {
      mkdirSync(path.join(root, 'dist'));
      writeFileSync(
        path.join(root, 'dist', 'cors.config.js'),
        "exports.default = { origins: ['https://compiled.example.com'] };\n",
      );
      writeFileSync(path.join(root, 'cors.config.ts'), 'not TypeScript at all');

      expect(loadCorsConfig()?.origins).toEqual([
        'https://compiled.example.com',
      ]);
    });

    it('reads no declaration when the build compiled none', () => {
      writeFileSync(path.join(root, 'cors.config.ts'), 'not TypeScript at all');

      expect(loadCorsConfig()).toBeNull();
    });
  });
});
