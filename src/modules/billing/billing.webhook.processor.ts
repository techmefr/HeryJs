import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { BILLING_QUEUE } from '#technical/jobs/jobs.constants';
import { runInTenant } from '#technical/tenancy/run-in-tenant';
import type { BillingSubscriptionStatus } from '#technical/billing/billing-driver';
import { BillingSubscriptionMirror } from './billing-subscription.mirror';
import { BILLING_MIRROR_JOB } from './billing.constants';

interface BillingMirrorJobData {
  provider: string;
  subscriptionId: string;
  tenantId: string;
  plan: string;
  status: BillingSubscriptionStatus;
  currentPeriodEnd: string;
}

@Processor(BILLING_QUEUE)
export class BillingWebhookProcessor extends WorkerHost {
  constructor(private readonly mirror: BillingSubscriptionMirror) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== BILLING_MIRROR_JOB) {
      return;
    }

    const data = job.data as BillingMirrorJobData;

    // The tenant the webhook was attributed to, reopened around the mirror
    // write -- without it BillingSubscription (tenant-scoped) has no ambient
    // tenant to stamp itself with, and the extension throws rather than
    // guessing one.
    await runInTenant(data.tenantId, () =>
      this.mirror.mirror({
        provider: data.provider,
        subscriptionId: data.subscriptionId,
        tenantId: data.tenantId,
        plan: data.plan,
        status: data.status,
        currentPeriodEnd: new Date(data.currentPeriodEnd),
      }),
    );
  }
}
