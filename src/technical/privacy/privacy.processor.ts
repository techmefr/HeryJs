import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { DelayedError } from 'bullmq';
import type { Job } from 'bullmq';
import { writeAuditLog } from '#technical/audit/audit-log';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { PRIVACY_QUEUE } from '#technical/jobs/jobs.constants';
import { PRISMA_CLIENT } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import { runInTenant } from '#technical/tenancy/run-in-tenant';
import { ErasureReplay } from './erasure-replay';
import { PersonalDataRegistry } from './personal-data.registry';
import {
  PRIVACY_DEFERRAL_DELAY_MS,
  PRIVACY_MAX_DEFERRALS,
  PRIVACY_PROCESS_JOB,
} from './privacy.constants';
import type { PrivacyJobData, PrivacyRequestKind } from './privacy.constants';
import { PrivacyExecutor } from './privacy.executor';
import type { ErasureOutcome, ExportOutcome } from './privacy.executor';

const ERROR_MAX_LENGTH = 500;

@Processor(PRIVACY_QUEUE)
export class PrivacyProcessor extends WorkerHost {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
    private readonly executor: PrivacyExecutor,
    private readonly registry: PersonalDataRegistry,
    private readonly erasures: ErasureReplay,
  ) {
    super();
  }

  async process(job: Job, token?: string): Promise<void> {
    if (job.name !== PRIVACY_PROCESS_JOB) {
      return;
    }

    const data = job.data as PrivacyJobData;
    const known = new Set(this.registry.all().map((entry) => entry.model));

    // Every instance runs a worker on this queue, and an instance that lacks a
    // resource the request was taken with would finish it without touching
    // that resource's rows. It hands the job back instead, without spending an
    // attempt, until one that knows them takes it.
    if (!data.models.every((model) => known.has(model))) {
      const deferrals = data.deferrals ?? 0;

      if (deferrals >= PRIVACY_MAX_DEFERRALS) {
        throw new Error(
          'No worker knows every resource this privacy request was taken with.',
        );
      }

      await job.updateData({ ...data, deferrals: deferrals + 1 });
      await job.moveToDelayed(Date.now() + PRIVACY_DEFERRAL_DELAY_MS, token);
      throw new DelayedError();
    }

    await runInTenant(data.tenantId, () => this.run(data), {
      userId: data.userId,
      impersonatedBy: data.impersonatedBy,
    });
  }

  private async run(data: PrivacyJobData): Promise<void> {
    const request = await this.prisma.privacyRequest.findFirst({
      where: { id: data.requestId },
    });

    if (!request || request.status === 'done') {
      return;
    }

    await this.prisma.privacyRequest.update({
      where: { id: request.id },
      data: { status: 'running', error: null },
    });

    try {
      const outcome = await this.execute(
        request.kind as PrivacyRequestKind,
        data,
        request.subjectId,
      );

      if (request.kind !== 'export') {
        await this.erasures.record(
          request.kind as 'erase-user' | 'erase-tenant',
          data.tenantId,
          request.subjectId,
          request.kind === 'erase-tenant' ? data.userId : null,
        );
      }

      // The completion entry carries counts and the request id. It is written
      // after the erasure on purpose: the entries the erasure redacted are the
      // ones that described the data, never this one.
      await writeAuditLog(authPrismaClient, {
        tenantId: data.tenantId,
        model: 'PrivacyRequest',
        operation: `privacy.${request.kind}.completed`,
        recordId: request.id,
        data: { subjectId: request.subjectId, summary: outcome.summary },
        userId: data.userId,
        impersonatedBy: data.impersonatedBy,
      });

      await this.prisma.privacyRequest.update({
        where: { id: request.id },
        data: {
          status: 'done',
          summary: outcome.summary,
          ...('result' in outcome ? { result: outcome.result } : {}),
          completedAt: new Date(),
        },
      });
    } catch (error) {
      await this.prisma.privacyRequest.update({
        where: { id: request.id },
        data: {
          status: 'failed',
          error: String((error as Error).message).slice(0, ERROR_MAX_LENGTH),
        },
      });

      throw error;
    }
  }

  private execute(
    kind: PrivacyRequestKind,
    data: PrivacyJobData,
    subjectId: string,
  ): Promise<ExportOutcome | ErasureOutcome> {
    switch (kind) {
      case 'export':
        return this.executor.exportUser(data.tenantId, subjectId);
      case 'erase-user':
        return this.executor.eraseUser(data.tenantId, subjectId);
      case 'erase-tenant':
        return this.executor.eraseTenant(data.tenantId, data.userId);
    }
  }
}
