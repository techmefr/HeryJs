import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import {
  RECOVERY_CODE_BYTES,
  RECOVERY_CODE_COUNT,
  RECOVERY_CODE_GROUP_SIZE,
} from './two-factor.constants';

const SALT_BYTES = 16;
const HASH_BYTES = 64;
const HASH_SCHEME = 'scrypt';
const PART_SEPARATOR = ':';
const EXPECTED_PARTS = 3;
const SEPARATOR_PATTERN = /[\s-]/g;

function derive(code: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(code, salt, HASH_BYTES, (error, key) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(key);
    });
  });
}

export function normalizeRecoveryCode(input: string): string {
  return input.replace(SEPARATOR_PATTERN, '').toLowerCase();
}

export function generateRecoveryCode(): string {
  const raw = randomBytes(RECOVERY_CODE_BYTES).toString('hex');
  const groups = raw.match(new RegExp(`.{1,${RECOVERY_CODE_GROUP_SIZE}}`, 'g'));

  return (groups ?? [raw]).join('-');
}

export function generateRecoveryCodes(
  count: number = RECOVERY_CODE_COUNT,
): string[] {
  return Array.from({ length: count }, () => generateRecoveryCode());
}

export async function hashRecoveryCode(code: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await derive(normalizeRecoveryCode(code), salt);

  return [
    HASH_SCHEME,
    salt.toString('base64url'),
    hash.toString('base64url'),
  ].join(PART_SEPARATOR);
}

export async function matchesRecoveryCode(
  code: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split(PART_SEPARATOR);
  const [scheme, salt, hash] = parts;

  if (
    parts.length !== EXPECTED_PARTS ||
    scheme !== HASH_SCHEME ||
    salt === undefined ||
    hash === undefined
  ) {
    return false;
  }

  const expected = Buffer.from(hash, 'base64url');
  const actual = await derive(
    normalizeRecoveryCode(code),
    Buffer.from(salt, 'base64url'),
  );

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
