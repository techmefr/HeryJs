import { Inject, Injectable } from '@nestjs/common';
import { JobsService } from '#kernel/jobs/jobs.service';
import type { PageQuery } from '#kernel/http/page-query';
import { PRISMA_CLIENT } from '#kernel/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#kernel/prisma/prisma.client';
import { TenantContextStorage } from '#kernel/tenancy/tenant-context';
import { MAIL_SEND_JOB } from './mail.constants';
import { renderTemplate } from './mail.templates';

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

  async queue(
    to: string,
    template: string,
    data: Record<string, string> = {},
  ): Promise<void> {
    const { subject, html } = renderTemplate(template, data);
    const tenantId = TenantContextStorage.getTenantId();

    const log = await this.prisma.mailLog.create({
      data: { tenantId, to, subject, status: 'queued' },
    });

    await this.jobs.dispatch(MAIL_SEND_JOB, {
      mailLogId: log.id,
      to,
      subject,
      html,
    });
  }
}
