import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { twoFactorEnv } from './two-factor.env';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const FORMAT_VERSION = 'v1';
const PART_SEPARATOR = '.';
const EXPECTED_PARTS = 4;

function key(): Buffer {
  return Buffer.from(twoFactorEnv().TWO_FACTOR_ENCRYPTION_KEY, 'hex');
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);

  return [
    FORMAT_VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    body.toString('base64url'),
  ].join(PART_SEPARATOR);
}

export function decryptSecret(stored: string): string {
  const parts = stored.split(PART_SEPARATOR);
  const [version, iv, tag, body] = parts;

  if (
    parts.length !== EXPECTED_PARTS ||
    version !== FORMAT_VERSION ||
    iv === undefined ||
    tag === undefined ||
    body === undefined
  ) {
    throw new Error('The stored second-factor secret is not readable.');
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    key(),
    Buffer.from(iv, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));

  return Buffer.concat([
    decipher.update(Buffer.from(body, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
