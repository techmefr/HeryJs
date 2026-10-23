import { randomBytes } from 'node:crypto';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { SecretsService } from '#technical/secrets/secrets.service';

const SECRET_BYTES = 32;
const SECRET_CONTEXT = 'WebhookEndpoint.secret';
const SEAL_BATCH_SIZE = 200;

/**
 * The inbound secret is sealed the way the outbound one is: verifying a
 * signature recomputes the sender's HMAC, so the plaintext has to come back
 * out, but it does not have to sit readable in the table. The envelope is bound
 * to its endpoint, so a secret copied onto another row fails to open.
 *
 * Endpoints minted before sealing hold their secret in plaintext. open() still
 * reads them, and the boot seals them in place, so an upgrade breaks no sender.
 */
@Injectable()
export class WebhookEndpointSecretService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Webhooks');

  constructor(private readonly secrets: SecretsService) {}

  generate(): string {
    return randomBytes(SECRET_BYTES).toString('hex');
  }

  seal(plaintext: string, endpointId: string): string {
    return this.secrets.encrypt(plaintext, `${SECRET_CONTEXT}:${endpointId}`);
  }

  open(stored: string, endpointId: string): string {
    if (!this.secrets.isSealed(stored)) {
      return stored;
    }

    return this.secrets.decrypt(stored, `${SECRET_CONTEXT}:${endpointId}`);
  }

  async onApplicationBootstrap(): Promise<void> {
    const sealed = await this.sealPlaintext();

    if (sealed > 0) {
      this.logger.log(`Sealed ${sealed} plaintext webhook endpoint secret(s).`);
    }
  }

  async sealPlaintext(): Promise<number> {
    let sealed = 0;
    let cursor = '';

    for (;;) {
      const rows = await authPrismaClient.webhookEndpoint.findMany({
        where: { id: { gt: cursor } },
        orderBy: { id: 'asc' },
        take: SEAL_BATCH_SIZE,
        select: { id: true, secret: true },
      });

      if (rows.length === 0) {
        return sealed;
      }

      for (const row of rows) {
        cursor = row.id;

        if (this.secrets.isSealed(row.secret)) {
          continue;
        }

        const { count } = await authPrismaClient.webhookEndpoint.updateMany({
          where: { id: row.id, secret: row.secret },
          data: { secret: this.seal(row.secret, row.id) },
        });
        sealed += count;
      }
    }
  }
}
