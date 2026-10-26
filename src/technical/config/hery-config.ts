import * as path from 'node:path';
import { devEnvironmentsIssues } from './dev-environments';
import type { HeryConfig } from './hery-config.types';
import { projectConfigPath, requireProjectConfig } from './project-config-file';

const CONFIG_FILENAME = 'hery.config.ts';

// hery.config.ts lives at the project root, next to package.json -- the
// placement every Nuxt/Vite/Astro-style config file uses. The build compiles
// it to dist/hery.config.js, which is what production reads.
export function loadHeryConfig(): HeryConfig {
  const configPath = projectConfigPath('hery.config');
  const config = requireProjectConfig<HeryConfig>(configPath);

  if (config === undefined) {
    throw new Error(
      `${path.relative(process.cwd(), configPath)} not found: ${CONFIG_FILENAME} declares the application, and the build compiles it to dist/hery.config.js.`,
    );
  }

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
  const issues = [
    ...CHOICES.flatMap(({ path: key, read, allowed }) => {
      const value = read(config);

      return value === undefined || allowed.includes(value as string)
        ? []
        : [
            `  ${key}: ${JSON.stringify(value)} is not one of ${allowed.join(', ')}`,
          ];
    }),
    ...devEnvironmentsIssues(config),
  ];

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
