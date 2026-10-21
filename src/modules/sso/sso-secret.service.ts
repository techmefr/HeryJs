import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ssoEnv } from './sso.env';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const VERSION = 'v1';
const SEPARATOR = ':';
const PART_COUNT = 4;

@Injectable()
export class SsoSecretService {
  private readonly key = Buffer.from(ssoEnv.SSO_SECRET_KEY, 'base64');

  seal(plaintext: string, connectionId: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);

    cipher.setAAD(Buffer.from(connectionId));

    const body = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    return [
      VERSION,
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      body.toString('base64url'),
    ].join(SEPARATOR);
  }

  open(sealed: string, connectionId: string): string {
    const parts = sealed.split(SEPARATOR);

    const [version, iv, tag, body] = parts;

    if (
      parts.length !== PART_COUNT ||
      version !== VERSION ||
      !iv ||
      !tag ||
      !body
    ) {
      throw new Error('The stored SSO client secret is not in a known format.');
    }

    const decipher = createDecipheriv(
      ALGORITHM,
      this.key,
      Buffer.from(iv, 'base64url'),
    );

    decipher.setAAD(Buffer.from(connectionId));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(body, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
