import { Inject, Injectable } from '@nestjs/common';
import { JobsService } from '#kernel/jobs/jobs.service';
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

  list(tenantId: string) {
    return this.prisma.mailLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
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
