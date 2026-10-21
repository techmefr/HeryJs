import { SecretDecryptionException } from '../errors/secret-decryption.exception';
import { SecretsMisconfiguredException } from '../errors/secrets-misconfigured.exception';
import { generateSecretKey, Keyring, parseSecretKeys } from './keyring';

const CONTEXT = 'BlogPost.privateNote';

function keyringOf(...ids: string[]): Keyring {
  return Keyring.fromEnv(
    ids.map((id) => `${id}:${generateSecretKey()}`).join(','),
  );
}

describe('Keyring', () => {
  it('opens what it sealed', () => {
    const keyring = keyringOf('1');

    expect(keyring.open(keyring.seal('hunter2', CONTEXT), CONTEXT)).toBe(
      'hunter2',
    );
  });

  it('round-trips empty and multi-byte values', () => {
    const keyring = keyringOf('1');

    for (const value of ['', 'zażółć gęślą jaźń', '🔐'.repeat(50)]) {
      expect(keyring.open(keyring.seal(value, CONTEXT), CONTEXT)).toBe(value);
    }
  });

  it('never repeats a ciphertext for the same plaintext', () => {
    const keyring = keyringOf('1');

    expect(keyring.seal('same', CONTEXT)).not.toBe(
      keyring.seal('same', CONTEXT),
    );
  });

  it('does not contain the plaintext and names the key that sealed it', () => {
    const keyring = keyringOf('2024-q4');
    const envelope = keyring.seal('a-recognisable-secret', CONTEXT);

    expect(envelope).not.toContain('a-recognisable-secret');
    expect(envelope.startsWith('enc:2024-q4:')).toBe(true);
    expect(keyring.keyIdOf(envelope)).toBe('2024-q4');
    expect(keyring.isEnvelope(envelope)).toBe(true);
    expect(keyring.isEnvelope('plain text')).toBe(false);
    expect(keyring.keyIdOf('plain text')).toBeNull();
  });

  it('refuses a ciphertext moved to another column', () => {
    const keyring = keyringOf('1');
    const envelope = keyring.seal('hunter2', CONTEXT);

    expect(() => keyring.open(envelope, 'BlogPost.title')).toThrow(
      SecretDecryptionException,
    );
  });

  it('refuses a tampered ciphertext', () => {
    const keyring = keyringOf('1');
    const [prefix, keyId, iv, tag, data] = keyring
      .seal('hunter2', CONTEXT)
      .split(':');
    const flipped = `${data!.slice(0, -2)}${data!.endsWith('AA') ? 'BB' : 'AA'}`;

    expect(() =>
      keyring.open([prefix, keyId, iv, tag, flipped].join(':'), CONTEXT),
    ).toThrow(SecretDecryptionException);
  });

  it('refuses a value that was never sealed', () => {
    expect(() => keyringOf('1').open('plain text', CONTEXT)).toThrow(
      SecretDecryptionException,
    );
  });

  it('reports the context and key of a failure without the value', () => {
    const keyring = keyringOf('1');
    const other = keyringOf('1');
    const envelope = other.seal('hunter2', CONTEXT);

    try {
      keyring.open(envelope, CONTEXT);
      throw new Error('expected a decryption failure');
    } catch (error) {
      expect(error).toBeInstanceOf(SecretDecryptionException);
      const failure = error as SecretDecryptionException;
      expect(failure.context).toBe(CONTEXT);
      expect(failure.keyId).toBe('1');
      expect(failure.message).not.toContain('hunter2');
      expect(failure.message).not.toContain(envelope);
    }
  });

  describe('with several keys', () => {
    const oldKey = generateSecretKey();
    const newKey = generateSecretKey();
    const before = Keyring.fromEnv(`1:${oldKey}`);
    const after = Keyring.fromEnv(`1:${oldKey},2:${newKey}`);

    it('seals with the last key by default and still opens older values', () => {
      const legacy = before.seal('hunter2', CONTEXT);

      expect(after.activeKeyId).toBe('2');
      expect(after.open(legacy, CONTEXT)).toBe('hunter2');
      expect(after.keyIdOf(after.seal('x', CONTEXT))).toBe('2');
    });

    it('seals with the declared active key', () => {
      const pinned = Keyring.fromEnv(`1:${oldKey},2:${newKey}`, '1');

      expect(pinned.keyIdOf(pinned.seal('x', CONTEXT))).toBe('1');
    });

    it('reseals an old value under the active key and leaves a current one alone', () => {
      const legacy = before.seal('hunter2', CONTEXT);
      const resealed = after.reseal(legacy, CONTEXT);

      expect(after.isCurrent(legacy)).toBe(false);
      expect(after.isCurrent(resealed)).toBe(true);
      expect(after.open(resealed, CONTEXT)).toBe('hunter2');
      expect(after.reseal(resealed, CONTEXT)).toBe(resealed);
    });

    it('cannot open a value once its key is retired', () => {
      const retired = Keyring.fromEnv(`2:${newKey}`);

      expect(() => retired.open(before.seal('x', CONTEXT), CONTEXT)).toThrow(
        SecretDecryptionException,
      );
    });
  });

  describe('configuration', () => {
    it('rejects an entry without an id', () => {
      expect(() => parseSecretKeys(generateSecretKey())).toThrow(
        SecretsMisconfiguredException,
      );
    });

    it('rejects a key that is not 32 bytes', () => {
      expect(() => parseSecretKeys('1:c2hvcnQ=')).toThrow(
        SecretsMisconfiguredException,
      );
    });

    it('rejects an id with a separator in it', () => {
      expect(() => parseSecretKeys(`a b:${generateSecretKey()}`)).toThrow(
        SecretsMisconfiguredException,
      );
    });

    it('rejects a duplicated id', () => {
      const key = generateSecretKey();

      expect(() => parseSecretKeys(`1:${key},1:${key}`)).toThrow(
        SecretsMisconfiguredException,
      );
    });

    it('rejects an empty list', () => {
      expect(() => parseSecretKeys(' , ')).toThrow(
        SecretsMisconfiguredException,
      );
    });

    it('rejects an active key that is not declared', () => {
      expect(() => Keyring.fromEnv(`1:${generateSecretKey()}`, '9')).toThrow(
        SecretsMisconfiguredException,
      );
    });
  });
});
