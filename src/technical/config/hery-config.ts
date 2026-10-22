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

  assertHeryConfigChoices(config);

  return config;
}

const CHOICES: Array<{
  path: string;
  read: (config: HeryConfig) => unknown;
  allowed: readonly string[];
}> = [
  {
    path: 'sharing.onGrantorErasure',
    read: (config) => config.sharing?.onGrantorErasure,
    allowed: ['revoke', 'keep'],
  },
  {
    path: 'admin.studioAccess',
    read: (config) => config.admin?.studioAccess,
    allowed: ['operator', 'tenant-admin'],
  },
];

/**
 * `satisfies HeryConfig` catches a typo at typecheck, but a value built from
 * an environment variable or a cast does not go through it. These choices
 * widen who sees what, so an unknown one stops the boot rather than reading
 * as whichever branch happens to come last.
 */
export function assertHeryConfigChoices(config: HeryConfig): void {
  const issues = CHOICES.flatMap(({ path: key, read, allowed }) => {
    const value = read(config);

    return value === undefined || allowed.includes(value as string)
      ? []
      : [
          `  ${key}: ${JSON.stringify(value)} is not one of ${allowed.join(', ')}`,
        ];
  });

  if (issues.length > 0) {
    throw new Error(`Invalid ${CONFIG_FILENAME}:\n${issues.join('\n')}`);
  }
}

export const heryConfig = loadHeryConfig();

// A DI token rather than importing `heryConfig` directly wherever it's
// needed: consumers like SearchEngineRegistry validate this value in their
// constructor, and a provider is what lets a test override it with a
// fixture instead of only ever seeing this process's real hery.config.ts.
export const HERY_CONFIG = Symbol('HERY_CONFIG');
