import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { SecretDecryptionException } from '../errors/secret-decryption.exception';
import { SecretsMisconfiguredException } from '../errors/secrets-misconfigured.exception';

const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const ALGORITHM = 'aes-256-gcm';
const ENVELOPE_PREFIX = 'enc';
const ENVELOPE_SEPARATOR = ':';
const ENVELOPE_PARTS = 5;
const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const KEY_LIST_SEPARATOR = ',';

export interface SecretKey {
  id: string;
  material: Buffer;
}

export function generateSecretKey(): string {
  return randomBytes(KEY_BYTES).toString('base64');
}

function parseKeyEntry(entry: string): SecretKey {
  const separatorAt = entry.indexOf(ENVELOPE_SEPARATOR);

  if (separatorAt === -1) {
    throw new SecretsMisconfiguredException(
      'each key must be written as <id>:<base64 key>',
    );
  }

  const id = entry.slice(0, separatorAt).trim();
  const material = Buffer.from(entry.slice(separatorAt + 1).trim(), 'base64');

  if (!KEY_ID_PATTERN.test(id)) {
    throw new SecretsMisconfiguredException(
      `key id "${id}" must be 1 to 32 letters, digits, dashes or underscores`,
    );
  }

  if (material.length !== KEY_BYTES) {
    throw new SecretsMisconfiguredException(
      `key "${id}" must decode to exactly ${KEY_BYTES} bytes (openssl rand -base64 ${KEY_BYTES})`,
    );
  }

  return { id, material };
}

export function parseSecretKeys(raw: string): SecretKey[] {
  const keys = raw
    .split(KEY_LIST_SEPARATOR)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map(parseKeyEntry);

  if (keys.length === 0) {
    throw new SecretsMisconfiguredException('SECRETS_KEYS declares no key');
  }

  const ids = new Set(keys.map((key) => key.id));

  if (ids.size !== keys.length) {
    throw new SecretsMisconfiguredException(
      'SECRETS_KEYS declares the same key id twice',
    );
  }

  return keys;
}

export class Keyring {
  private readonly keys: ReadonlyMap<string, Buffer>;
  readonly activeKeyId: string;

  constructor(keys: readonly SecretKey[], activeKeyId?: string) {
    const last = keys[keys.length - 1];

    if (!last) {
      throw new SecretsMisconfiguredException('no key is configured');
    }

    this.keys = new Map(keys.map((key) => [key.id, key.material]));
    this.activeKeyId = activeKeyId ?? last.id;

    if (!this.keys.has(this.activeKeyId)) {
      throw new SecretsMisconfiguredException(
        `SECRETS_ACTIVE_KEY_ID "${this.activeKeyId}" is not one of SECRETS_KEYS`,
      );
    }
  }

  static fromEnv(rawKeys: string, activeKeyId?: string): Keyring {
    return new Keyring(parseSecretKeys(rawKeys), activeKeyId);
  }

  get keyIds(): string[] {
    return [...this.keys.keys()];
  }

  isEnvelope(value: string): boolean {
    return (
      value.startsWith(`${ENVELOPE_PREFIX}${ENVELOPE_SEPARATOR}`) &&
      value.split(ENVELOPE_SEPARATOR).length === ENVELOPE_PARTS
    );
  }

  keyIdOf(envelope: string): string | null {
    return this.isEnvelope(envelope)
      ? (envelope.split(ENVELOPE_SEPARATOR)[1] ?? null)
      : null;
  }

  isCurrent(envelope: string): boolean {
    return this.keyIdOf(envelope) === this.activeKeyId;
  }

  seal(plaintext: string, context: string): string {
    const key = this.keys.get(this.activeKeyId) as Buffer;
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv, {
      authTagLength: TAG_BYTES,
    });
    cipher.setAAD(Buffer.from(context, 'utf8'));
    const data = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    return [
      ENVELOPE_PREFIX,
      this.activeKeyId,
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      data.toString('base64url'),
    ].join(ENVELOPE_SEPARATOR);
  }

  open(envelope: string, context: string): string {
    if (!this.isEnvelope(envelope)) {
      throw new SecretDecryptionException(context, null);
    }

    const [, keyId = '', iv = '', tag = '', data = ''] =
      envelope.split(ENVELOPE_SEPARATOR);
    const key = this.keys.get(keyId);

    if (!key) {
      throw new SecretDecryptionException(context, keyId);
    }

    try {
      const decipher = createDecipheriv(
        ALGORITHM,
        key,
        Buffer.from(iv, 'base64url'),
        { authTagLength: TAG_BYTES },
      );
      decipher.setAAD(Buffer.from(context, 'utf8'));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));

      return Buffer.concat([
        decipher.update(Buffer.from(data, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new SecretDecryptionException(context, keyId);
    }
  }

  reseal(envelope: string, context: string): string {
    return this.isCurrent(envelope)
      ? envelope
      : this.seal(this.open(envelope, context), context);
  }
}
