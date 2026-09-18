import { Injectable, Logger } from '@nestjs/common';
import type {
  BillingDriver,
  BillingEvent,
} from '#technical/billing/billing-driver';

/**
 * The zero-config default, and the one driver in this convention that cannot
 * honestly implement its contract: mail's log driver can safely *not send*,
 * because logging instead of sending is the safe behaviour. There is no
 * equivalent safe behaviour for *verifying a signature that does not exist* --
 * a webhook only means something once a real provider and a real secret are
 * configured.
 *
 * So this driver's honesty is refusing loudly rather than pretending to
 * verify. The alternative -- accepting every payload because there is nothing
 * to check it against -- would let anyone mint a subscription for any tenant
 * by posting to the webhook route.
 */
@Injectable()
export class LogBillingDriver implements BillingDriver {
  private readonly logger = new Logger('Billing');

  parseWebhook(rawBody: Buffer): BillingEvent[] {
    this.logger.warn(
      `Received a ${rawBody.byteLength}-byte billing webhook, but no billing driver is installed to verify it. Run "pnpm hery install billing-stripe" or your provider's driver.`,
    );

    throw new Error(
      'No billing driver is configured. The log driver cannot verify a webhook signature -- install a provider driver.',
    );
  }
}
