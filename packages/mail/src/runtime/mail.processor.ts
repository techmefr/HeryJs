import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Job } from 'bullmq';
import { DEFAULT_QUEUE } from '#kernel/jobs/jobs.constants';
import { PRISMA_CLIENT } from '#kernel/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#kernel/prisma/prisma.client';
import { MAIL_SEND_JOB } from './mail.constants';
import { MailDriverRegistry } from './mail-driver.registry';

interface MailSendJobData {
  mailLogId: string;
  to: string;
  subject: string;
  html: string;
}

@Processor(DEFAULT_QUEUE)
export class MailProcessor extends WorkerHost {
  constructor(
    private readonly drivers: MailDriverRegistry,
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== MAIL_SEND_JOB) {
      return;
    }

    const { mailLogId, to, subject, html } = job.data as MailSendJobData;

    try {
      // Read through the registry per job rather than caching the driver in a
      // field: the worker is long-lived, and resolving on use keeps it honest
      // if the active driver is ever swapped under it.
      await this.drivers.active.send({ to, subject, html });
      await this.prisma.mailLog.update({
        where: { id: mailLogId },
        data: { status: 'sent', sentAt: new Date() },
      });
    } catch (error) {
      await this.prisma.mailLog.update({
        where: { id: mailLogId },
        data: {
          status: 'failed',
          error: error instanceof Error ? error.message : 'unknown error',
        },
      });
      throw error;
    }
  }
}
