import { Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { UnthrottledRoute } from '#kernel/rate-limit/rate-limit.decorator';
import { PublicRoute } from '#kernel/capabilities/public-route.decorator';
import { ok } from '#kernel/http/envelope';
import { JobsService } from '#kernel/jobs/jobs.service';
import { BILLING_QUEUE } from '#kernel/jobs/jobs.constants';
import { BillingWebhookGuard } from './billing-webhook.guard';
import type { RequestWithBillingEvents } from './billing-webhook.guard';
import { BILLING_MIRROR_JOB, BILLING_MIRROR_POLICY } from './billing.constants';

/**
 * One route, fixed, unlike the generic webhooks module's per-tenant
 * `/webhooks/:endpointId`. A billing provider is configured once in its own
 * dashboard against a URL you register there, and it signs with a secret it
 * assigns -- not one this app generates per tenant -- so there is no endpoint
 * id to route on.
 */
@Controller('billing')
export class BillingWebhookController {
  constructor(private readonly jobs: JobsService) {}

  @UnthrottledRoute(
    'signed by the provider: the HMAC signature is the credential, not a request budget',
  )
  @Post('webhook')
  @HttpCode(202)
  @UseGuards(BillingWebhookGuard)
  @PublicRoute(
    'inbound webhook: the provider has no session, it signs the raw body with a secret only it and this app know',
  )
  async receive(@Req() req: RequestWithBillingEvents) {
    // Queued rather than mirrored inline: the provider expects a fast
    // response and retries on a timeout, and mirroring runs a database write
    // per event -- fine to do once per webhook delivery, not fine to do while
    // the provider is waiting to hear back.
    for (const event of req.billingEvents) {
      await this.jobs.dispatchTo(
        BILLING_QUEUE,
        BILLING_MIRROR_JOB,
        { ...event, currentPeriodEnd: event.currentPeriodEnd.toISOString() },
        BILLING_MIRROR_POLICY,
      );
    }

    return ok({ queued: req.billingEvents.length });
  }
}
