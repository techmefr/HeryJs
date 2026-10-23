import {
  DEFAULT_DEV_ENVIRONMENTS,
  devEnvironmentsOf,
  isDevEnvironment,
  sharedDevEnvironmentWarning,
} from './dev-environments';
import { buildServerSchema } from './env-schema';
import { assertHeryConfigChoices } from './hery-config';
import type { HeryConfig } from './hery-config.types';

describe('devTools.environments', () => {
  it('defaults to development and test', () => {
    expect(devEnvironmentsOf({})).toEqual(['development', 'test']);
    expect(DEFAULT_DEV_ENVIRONMENTS).toEqual(['development', 'test']);
  });

  it('keeps an unset NODE_ENV closed', () => {
    expect(isDevEnvironment(undefined, DEFAULT_DEV_ENVIRONMENTS)).toBe(false);
  });

  it('opens a listed demo and keeps an unlisted one closed', () => {
    const listed = devEnvironmentsOf({
      devTools: { environments: ['development', 'test', 'demo'] },
    });

    expect(isDevEnvironment('demo', listed)).toBe(true);
    expect(isDevEnvironment('demo', DEFAULT_DEV_ENVIRONMENTS)).toBe(false);
  });

  it('warns at boot only for a shared environment', () => {
    const listed = ['development', 'test', 'demo'];

    expect(sharedDevEnvironmentWarning('demo', listed)).toMatch(
      /NODE_ENV=demo[\s\S]*admin or the platform operator/,
    );
    expect(sharedDevEnvironmentWarning('development', listed)).toBeNull();
    expect(sharedDevEnvironmentWarning('production', listed)).toBeNull();
  });

  it('refuses the development secrets outside the list', () => {
    const base = { DATABASE_URL: 'postgresql://example/db' };

    expect(buildServerSchema(undefined).safeParse(base).success).toBe(false);
    expect(buildServerSchema('demo').safeParse(base).success).toBe(false);
    expect(
      buildServerSchema('demo', ['development', 'test', 'demo']).safeParse(base)
        .success,
    ).toBe(true);
  });

  it('accepts a list of environment names', () => {
    expect(() =>
      assertHeryConfigChoices({
        devTools: { environments: ['development', 'test', 'demo'] },
      }),
    ).not.toThrow();
  });

  it('stops the boot on an unknown value, naming the key', () => {
    const invalid = (environments: unknown) => () =>
      assertHeryConfigChoices({
        devTools: { environments },
      } as unknown as HeryConfig);

    expect(invalid(['production'])).toThrow(
      /devTools\.environments: "production"/,
    );
    expect(invalid(['Demo Env'])).toThrow(/devTools\.environments: "Demo Env"/);
    expect(invalid([''])).toThrow(/devTools\.environments: ""/);
    expect(invalid('demo')).toThrow(/devTools\.environments: "demo"/);
  });
});
