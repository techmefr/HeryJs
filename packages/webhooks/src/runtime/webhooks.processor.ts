import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Job } from 'bullmq';
import { authPrismaClient } from '#kernel/auth/better-auth.instance';
import { writeAuditLog } from '#kernel/audit/audit-log';
import { WEBHOOK_QUEUE } from '#kernel/jobs/jobs.constants';
import { NOTIFICATION_PROVIDER } from '#kernel/notifications/notification.types';
import type { NotificationProvider } from '#kernel/notifications/notification.types';
import { SignalService } from '#kernel/signal/signal.service';
import { runInTenant } from '#kernel/tenancy/run-in-tenant';

interface WebhookProcessJobData {
  eventId: string;
}

@Processor(WEBHOOK_QUEUE)
export class WebhooksProcessor extends WorkerHost {
  constructor(
    @Inject(NOTIFICATION_PROVIDER)
    private readonly notifications: NotificationProvider,
    private readonly signal: SignalService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'webhook.process') {
      return;
    }

    const { eventId } = job.data as WebhookProcessJobData;

    const event = await authPrismaClient.webhookEvent.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      return;
    }

    const admins = await authPrismaClient.user.findMany({
      where: { tenantId: event.tenantId, role: 'admin' },
      select: { id: true },
    });

    // A notification is a tenant-scoped row and this runs on a worker, with no
    // request behind it: the tenant comes from the event being processed.
    await runInTenant(event.tenantId, () =>
      Promise.all(
        admins.map((admin) =>
          this.notifications.send(admin.id, 'webhook.received', {
            eventId: event.id,
            source: event.source,
          }),
        ),
      ),
    );

    await writeAuditLog(authPrismaClient, {
      tenantId: event.tenantId,
      model: 'WebhookEvent',
      operation: 'process',
      recordId: event.id,
      data: { source: event.source },
      userId: null,
      impersonatedBy: null,
    });

    await authPrismaClient.webhookEvent.update({
      where: { id: event.id },
      data: { processedAt: new Date() },
    });

    void this.signal.publish(`${event.tenantId}:webhookEvent`);
  }
}
