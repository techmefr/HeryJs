import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Job } from 'bullmq';
import { DEFAULT_QUEUE } from '../../technical/jobs/jobs.constants';
import { PRISMA_CLIENT } from '../../technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '../../technical/prisma/prisma.client';
import { MAIL_PROVIDER } from './mail.types';
import type { MailProvider } from './mail.types';

interface MailSendJobData {
  mailLogId: string;
  to: string;
  subject: string;
  html: string;
}

@Processor(DEFAULT_QUEUE)
export class MailProcessor extends WorkerHost {
  constructor(
    @Inject(MAIL_PROVIDER) private readonly provider: MailProvider,
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'mail.send') {
      return;
    }

    const { mailLogId, to, subject, html } = job.data as MailSendJobData;

    try {
      await this.provider.send({ to, subject, html });
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
