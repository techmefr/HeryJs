import { Inject, Injectable } from '@nestjs/common';
import { JobsService } from '#technical/jobs/jobs.service';
import type { PageQuery } from '#technical/http/page-query';
import { PRISMA_CLIENT } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { MAIL_SEND_JOB } from './mail.constants';
import { renderTemplate } from './mail.templates';
import type { Mailable, MailMessage } from '#technical/mail/mail-driver';

@Injectable()
export class MailService {
  constructor(
    private readonly jobs: JobsService,
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  async list(tenantId: string, page: PageQuery) {
    const where = { tenantId };

    // The id breaks a createdAt tie, so two mails logged in the same
    // millisecond keep one order across requests instead of drifting between
    // pages.
    const [records, total] = await Promise.all([
      this.prisma.mailLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.mailLog.count({ where }),
    ]);

    return { records, total };
  }

  /**
   * The call every resource makes, and the whole reason the driver convention
   * exists: it names what to send, never who sends it. Swapping MAIL_DRIVER
   * from log to smtp leaves every call site here untouched.
   */
  async send(mailable: Mailable): Promise<void> {
    const message = await mailable.build();

    await this.enqueue({ ...message, to: mailable.to });
  }

  async queue(
    to: string,
    template: string,
    data: Record<string, string> = {},
  ): Promise<void> {
    const { subject, html } = renderTemplate(template, data);

    await this.enqueue({ to, subject, html });
  }

  // The log row is written before the job is dispatched, so a message can
  // never be sent by a worker that has nothing to record its outcome against.
  private async enqueue(message: MailMessage): Promise<void> {
    const tenantId = TenantContextStorage.getTenantId();

    const log = await this.prisma.mailLog.create({
      data: {
        tenantId,
        to: message.to,
        subject: message.subject,
        status: 'queued',
      },
    });

    await this.jobs.dispatch(MAIL_SEND_JOB, { mailLogId: log.id, ...message });
  }
}
