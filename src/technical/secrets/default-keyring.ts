import {
  devEnvironmentsOf,
  isDevEnvironment,
} from '../config/dev-environments';
import { heryConfig } from '../config/hery-config';
import { DEV_SECRETS_KEYS } from '../config/env-schema';
import { env } from '../config/env';
import { SecretsMisconfiguredException } from '../errors/secrets-misconfigured.exception';
import { Keyring } from './keyring';

let keyring: Keyring | null = null;

export function defaultKeyring(): Keyring {
  if (keyring) {
    return keyring;
  }

  if (
    !isDevEnvironment(process.env.NODE_ENV, devEnvironmentsOf(heryConfig)) &&
    env.SECRETS_KEYS === DEV_SECRETS_KEYS
  ) {
    throw new SecretsMisconfiguredException(
      'SECRETS_KEYS is still the development default; set real keys (pnpm hery secrets:key)',
    );
  }

  keyring = Keyring.fromEnv(env.SECRETS_KEYS, env.SECRETS_ACTIVE_KEY_ID);

  return keyring;
}
