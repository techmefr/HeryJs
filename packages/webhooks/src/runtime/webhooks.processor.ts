import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { authPrismaClient } from '#kernel/auth/better-auth.instance';
import { writeAuditLog } from '#kernel/audit/audit-log';
import { WEBHOOK_QUEUE } from '#kernel/jobs/jobs.constants';
import { ExpositionRegistry } from '#kernel/exposition/exposition.registry';
import { ExpositionRunner } from '#kernel/exposition/exposition-runner.service';
import { InvalidQueryException } from '#kernel/errors/invalid-query.exception';
import { NOTIFICATION_PROVIDER } from '#kernel/notifications/notification.types';
import type { NotificationProvider } from '#kernel/notifications/notification.types';
import { SignalService } from '#kernel/signal/signal.service';
import { runInTenant } from '#kernel/tenancy/run-in-tenant';
import { exposedActionOf } from './exposed-webhook-source';

interface WebhookProcessJobData {
  eventId: string;
}

@Processor(WEBHOOK_QUEUE)
export class WebhooksProcessor extends WorkerHost {
  private readonly logger = new Logger('Webhooks');

  constructor(
    @Inject(NOTIFICATION_PROVIDER)
    private readonly notifications: NotificationProvider,
    private readonly signal: SignalService,
    private readonly actions: ExpositionRegistry,
    private readonly runner: ExpositionRunner,
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

    const actionName = exposedActionOf(event.source);

    if (actionName !== null) {
      await this.runExposedAction(actionName, event);
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

    // The signal is a change notification, not part of the work: the event is
    // processed and committed by the time this runs, so a publish that fails
    // must not fail the job and have the whole event processed a second time.
    // It does have to be read, though. Left as a bare `void`, a rejection here
    // owned nobody -- and the publisher is closed on shutdown while a job can
    // still be in flight, so the rejection surfaced as an unhandled one,
    // failing whichever test happened to be running at the time.
    try {
      await this.signal.publish(`${event.tenantId}:webhookEvent`);
    } catch (error) {
      this.logger.warn(
        `Could not signal webhookEvent for tenant ${event.tenantId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  // The signature already authenticated the sender, and the endpoint could only
  // be minted for an action that opted in. The action is re-checked here anyway,
  // because the registry is code and the endpoint is a row: a redeploy that drops
  // the opt-in must stop the door working, not leave a stale row running it. The
  // event is marked processed only once the action has run, so a failed run is
  // retried by the queue instead of being recorded as done. A payload the
  // action's bounds refuse is the exception: it would fail identically on every
  // retry, so it is logged and closed.
  private async runExposedAction(
    actionName: string,
    event: { id: string; tenantId: string; payload: unknown },
  ): Promise<void> {
    const action = this.actions.get(actionName);

    if (!action || action.triggers?.webhook !== true) {
      this.logger.warn(
        `Webhook event ${event.id} names "${actionName}", which is no longer exposed to webhooks.`,
      );
      await this.markProcessed(event.id);
      return;
    }

    const params =
      event.payload !== null &&
      typeof event.payload === 'object' &&
      !Array.isArray(event.payload)
        ? (event.payload as Record<string, unknown>)
        : {};

    try {
      await runInTenant(event.tenantId, () =>
        this.runner.runTrusted(actionName, params),
      );
    } catch (error) {
      if (!(error instanceof InvalidQueryException)) {
        throw error;
      }

      this.logger.warn(
        `Webhook event ${event.id} carries params "${actionName}" refuses: ${error.message}`,
      );
    }

    await this.markProcessed(event.id);
  }

  private async markProcessed(eventId: string): Promise<void> {
    await authPrismaClient.webhookEvent.update({
      where: { id: eventId },
      data: { processedAt: new Date() },
    });
  }
}
