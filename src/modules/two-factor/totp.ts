import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  MS_PER_SECOND,
  TOTP_DIGITS,
  TOTP_SECRET_BYTES,
  TOTP_STEP_SECONDS,
} from './two-factor.constants';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const BITS_PER_BASE32_CHAR = 5;
const BASE32_MASK = 31;
const BITS_PER_BYTE = 8;
const BYTE_MASK = 255;
const DYNAMIC_TRUNCATION_MASK = 0x7fffffff;
const LOW_NIBBLE_MASK = 0x0f;
const COUNTER_BYTES = 8;
const DECIMAL_BASE = 10;

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of bytes) {
    value = ((value << BITS_PER_BYTE) | byte) & 0xffff;
    bits += BITS_PER_BYTE;

    while (bits >= BITS_PER_BASE32_CHAR) {
      const index = (value >>> (bits - BITS_PER_BASE32_CHAR)) & BASE32_MASK;
      output += BASE32_ALPHABET.charAt(index);
      bits -= BITS_PER_BASE32_CHAR;
    }
  }

  if (bits > 0) {
    const index = (value << (BITS_PER_BASE32_CHAR - bits)) & BASE32_MASK;
    output += BASE32_ALPHABET.charAt(index);
  }

  return output;
}

export function base32Decode(text: string): Buffer {
  const cleaned = text.replace(/[\s=-]/g, '').toUpperCase();
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char);

    if (index === -1) {
      throw new Error('Not a base32 string.');
    }

    value = ((value << BITS_PER_BASE32_CHAR) | index) & 0xffff;
    bits += BITS_PER_BASE32_CHAR;

    if (bits >= BITS_PER_BYTE) {
      bytes.push((value >>> (bits - BITS_PER_BYTE)) & BYTE_MASK);
      bits -= BITS_PER_BYTE;
    }
  }

  return Buffer.from(bytes);
}

export function generateSecret(): string {
  return base32Encode(randomBytes(TOTP_SECRET_BYTES));
}

export function hotp(
  secret: Buffer,
  counter: number,
  digits: number = TOTP_DIGITS,
): string {
  const message = Buffer.alloc(COUNTER_BYTES);
  message.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac('sha1', secret).update(message).digest();
  const offset = (digest[digest.length - 1] ?? 0) & LOW_NIBBLE_MASK;
  const truncated =
    (digest.readUInt32BE(offset) & DYNAMIC_TRUNCATION_MASK) %
    DECIMAL_BASE ** digits;

  return truncated.toString().padStart(digits, '0');
}

export function stepAt(timeMs: number): number {
  return Math.floor(timeMs / MS_PER_SECOND / TOTP_STEP_SECONDS);
}

export function matchStep(
  secret: Buffer,
  code: string,
  nowMs: number,
  window: number,
): number | null {
  if (!new RegExp(`^\\d{${TOTP_DIGITS}}$`).test(code)) {
    return null;
  }

  const submitted = Buffer.from(code);
  const current = stepAt(nowMs);
  let matched: number | null = null;

  for (let step = current - window; step <= current + window; step += 1) {
    const expected = Buffer.from(hotp(secret, step));

    if (timingSafeEqual(expected, submitted)) {
      matched = step;
    }
  }

  return matched;
}

export function otpauthUrl(
  issuer: string,
  account: string,
  secret: string,
): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const query = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });

  return `otpauth://totp/${label}?${query.toString()}`;
}
