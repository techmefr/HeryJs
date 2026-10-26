import { existsSync } from 'node:fs';
import * as path from 'node:path';

let tsNodeRegistered = false;

function ensureTsNodeRegistered(): void {
  if (tsNodeRegistered) {
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('ts-node/register/transpile-only');
  tsNodeRegistered = true;
}

/**
 * Where a config file of the project root is read from: the TypeScript source
 * while developing, transpiled on the fly, and in production the JavaScript
 * the build compiled next to the application, so the image needs neither
 * ts-node nor typescript.
 */
export function projectConfigPath(name: string): string {
  const root = process.cwd();

  if (process.env.NODE_ENV === 'production') {
    return path.resolve(root, 'dist', `${name}.js`);
  }

  return path.resolve(root, `${name}.ts`);
}

export function requireProjectConfig<T>(configPath: string): T | undefined {
  if (!existsSync(configPath)) {
    return undefined;
  }

  if (configPath.endsWith('.ts')) {
    ensureTsNodeRegistered();
  }

  delete require.cache[configPath];

  // The path is only known at runtime (process.cwd()), so this cannot be a
  // static import.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const loaded = require(configPath) as { default?: T } & T;

  return loaded.default ?? loaded;
}
