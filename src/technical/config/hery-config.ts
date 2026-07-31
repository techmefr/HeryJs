import * as path from 'node:path';
import type { HeryConfig } from './hery-config.types';

const CONFIG_FILENAME = 'hery.config.ts';

let tsNodeRegistered = false;

// hery.config.ts lives at the project root, next to package.json -- the
// placement every Nuxt/Vite/Astro-style config file uses, and deliberately
// outside src/, so it is never touched by nest build's own SWC pipeline.
// Reading it back means transpiling it ourselves at the moment it is asked
// for, the same way a downstream project's own tooling would, rather than
// assuming some other part of the process already hooked .ts requires.
function ensureTsNodeRegistered(): void {
  if (tsNodeRegistered) {
    return;
  }

  // One of the few legitimate require() calls in this codebase: registering
  // a require hook is a CommonJS-only operation, there is no import()
  // equivalent for it.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('ts-node/register/transpile-only');
  tsNodeRegistered = true;
}

function resolveConfigPath(): string {
  return path.resolve(process.cwd(), CONFIG_FILENAME);
}

export function loadHeryConfig(): HeryConfig {
  ensureTsNodeRegistered();

  const configPath = resolveConfigPath();
  delete require.cache[configPath];

  // The config path is only known at runtime (process.cwd()), so this
  // cannot be a static import.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const loaded = require(configPath) as { default?: HeryConfig } & HeryConfig;
  const config = loaded.default ?? loaded;

  if (!config || typeof config !== 'object') {
    throw new Error(
      `${CONFIG_FILENAME} must export a default object satisfying HeryConfig`,
    );
  }

  return config;
}

export const heryConfig = loadHeryConfig();
