import { SecretDecryptionException } from '../errors/secret-decryption.exception';
import { generateSecretKey } from './keyring';
import { SecretsService } from './secrets.service';

const CONTEXT = 'integration.apiToken';

describe('SecretsService', () => {
  const service = new SecretsService();

  it('encrypts and decrypts a value bound to its context', () => {
    const sealed = service.encrypt('sk_live_123', CONTEXT);

    expect(sealed).not.toContain('sk_live_123');
    expect(service.decrypt(sealed, CONTEXT)).toBe('sk_live_123');
    expect(() => service.decrypt(sealed, 'integration.other')).toThrow(
      SecretDecryptionException,
    );
  });

  it('reports whether a value is on the active key', () => {
    const sealed = service.encrypt('x', CONTEXT);

    expect(service.isCurrent(sealed)).toBe(true);
    expect(service.isCurrent('enc:retired:aa:bb:cc')).toBe(false);
    expect(service.reencrypt(sealed, CONTEXT)).toBe(sealed);
  });

  it('exposes the id of the key it seals with', () => {
    expect(service.activeKeyId).toEqual(expect.any(String));
  });
});

describe('the default keyring in production', () => {
  const previousNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = previousNodeEnv;
    jest.dontMock('../config/env');
    jest.resetModules();
  });

  function keyringLoadedWith(keys: string): () => unknown {
    process.env.NODE_ENV = 'production';
    jest.resetModules();
    jest.doMock('../config/env', () => ({ env: { SECRETS_KEYS: keys } }));

    return jest.requireActual<typeof import('./default-keyring')>(
      './default-keyring',
    ).defaultKeyring;
  }

  it('refuses the development key', () => {
    const { DEV_SECRETS_KEYS } = jest.requireActual<
      typeof import('../config/env-schema')
    >('../config/env-schema');

    expect(keyringLoadedWith(DEV_SECRETS_KEYS)).toThrow(
      /still the development default/,
    );
  });

  it('accepts a real key', () => {
    expect(keyringLoadedWith(`1:${generateSecretKey()}`)()).toBeDefined();
  });
});
