import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { SecretsService } from '#kernel/secrets/secrets.service';

const SECRET_BYTES = 32;
const SECRET_PREFIX = 'whsec_';
const SECRET_CONTEXT = 'WebhookSubscription.secret';

/**
 * The signing secret has to come back out in plaintext to compute an HMAC, so it
 * is sealed rather than hashed: AES-GCM under the kernel keyring, bound to the
 * subscription it belongs to. A secret copied onto another row fails to open.
 * Sealed values stay readable as long as their key stays in SECRETS_KEYS.
 */
@Injectable()
export class WebhookSecretService {
  constructor(private readonly secrets: SecretsService) {}

  generate(): string {
    return `${SECRET_PREFIX}${randomBytes(SECRET_BYTES).toString('base64url')}`;
  }

  seal(plaintext: string, subscriptionId: string): string {
    return this.secrets.encrypt(
      plaintext,
      `${SECRET_CONTEXT}:${subscriptionId}`,
    );
  }

  open(sealed: string, subscriptionId: string): string {
    return this.secrets.decrypt(sealed, `${SECRET_CONTEXT}:${subscriptionId}`);
  }
}
