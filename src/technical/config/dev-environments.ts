import type { HeryConfig } from './hery-config.types';

export const DEFAULT_DEV_ENVIRONMENTS: readonly string[] = [
  'development',
  'test',
];

const ENVIRONMENT_NAME = /^[a-z][a-z0-9-]*$/;

/**
 * The NODE_ENV values that open the devtools routes and accept the
 * development secrets. Closed by default: an unset NODE_ENV, or one that is not
 * listed, runs exactly as production does.
 */
export function devEnvironmentsOf(config: HeryConfig): readonly string[] {
  return config.devTools?.environments ?? DEFAULT_DEV_ENVIRONMENTS;
}

export function isDevEnvironment(
  nodeEnv: string | undefined,
  environments: readonly string[],
): boolean {
  return nodeEnv !== undefined && environments.includes(nodeEnv);
}

/**
 * A listed environment beyond development and test is a shared one (a demo,
 * a staging): the routes open there, but the seeders stay behind an operator
 * or an admin, and the boot says so.
 */
export function isSharedDevEnvironment(
  nodeEnv: string | undefined,
  environments: readonly string[],
): boolean {
  return (
    isDevEnvironment(nodeEnv, environments) &&
    !DEFAULT_DEV_ENVIRONMENTS.includes(nodeEnv as string)
  );
}

export function sharedDevEnvironmentWarning(
  nodeEnv: string | undefined,
  environments: readonly string[],
): string | null {
  return isSharedDevEnvironment(nodeEnv, environments)
    ? `NODE_ENV=${nodeEnv} is listed in devTools.environments: the devtools routes are open and the development secrets are accepted. Seeders stay limited to an admin or the platform operator. Never list an environment that holds real data.`
    : null;
}

export function devEnvironmentsIssues(config: HeryConfig): string[] {
  const environments: unknown = config.devTools?.environments;

  if (environments === undefined) {
    return [];
  }

  if (!Array.isArray(environments)) {
    return [
      `  devTools.environments: ${JSON.stringify(environments)} is not a list of environment names`,
    ];
  }

  return environments.flatMap((value: unknown) =>
    typeof value === 'string' &&
    ENVIRONMENT_NAME.test(value) &&
    value !== 'production'
      ? []
      : [
          `  devTools.environments: ${JSON.stringify(value)} is not an environment that may open the devtools (lowercase name, never "production")`,
        ],
  );
}
