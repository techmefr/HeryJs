import { env } from '#technical/config/env';

const mutableEnv = env as unknown as Record<string, string | undefined>;

export function grantPlatformOperator(userId: string): void {
  const current = (mutableEnv.PLATFORM_OPERATOR_IDS ?? '')
    .split(',')
    .filter((entry) => entry !== '');

  mutableEnv.PLATFORM_OPERATOR_IDS = [...current, userId].join(',');
}

export function clearPlatformOperators(): void {
  mutableEnv.PLATFORM_OPERATOR_IDS = undefined;
}
