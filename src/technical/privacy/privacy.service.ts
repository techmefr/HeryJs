import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { writeAuditLog } from '#technical/audit/audit-log';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import type { AuthenticatedUser } from '#technical/auth/auth.types';
import { CapabilityForbiddenException } from '#technical/errors/capability-forbidden.exception';
import { RecordNotFoundException } from '#technical/errors/record-not-found.exception';
import { TenantErasureNotConfirmedException } from '#technical/errors/tenant-erasure-not-confirmed.exception';
import { PersonalDataRegistry } from './personal-data.registry';
import { PRIVACY_QUEUE } from '#technical/jobs/jobs.constants';
import { JobsService } from '#technical/jobs/jobs.service';
import { PRISMA_CLIENT } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import type { PageQuery } from '#technical/http/page-query';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import {
  PRIVACY_PROCESS_JOB,
  PRIVACY_PROCESS_POLICY,
} from './privacy.constants';
import type {
  PrivacyJobData,
  PrivacyRequestKind,
  PrivacyRequestStatus,
} from './privacy.constants';

export interface PrivacyRequestView {
  id: string;
  kind: PrivacyRequestKind;
  status: PrivacyRequestStatus;
  subjectId: string;
  summary: unknown;
  error: string | null;
  createdAt: Date;
  completedAt: Date | null;
  deliveredAt: Date | null;
  // An export's bundle, present on the one read that collects it.
  result?: unknown;
}

interface PrivacyRequestRow {
  id: string;
  kind: string;
  status: string;
  subjectId: string;
  summary: unknown;
  error: string | null;
  createdAt: Date;
  completedAt: Date | null;
  deliveredAt: Date | null;
}

const ERROR_MAX_LENGTH = 500;

/**
 * The request side of a privacy action: it records what was asked, writes the
 * audit entry, and hands the work to the queue. The work itself -- reading and
 * rewriting every row a person owns -- is as large as the data is, so it never
 * runs inside the request that asked for it.
 */
@Injectable()
export class PrivacyService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
    private readonly jobs: JobsService,
    private readonly registry: PersonalDataRegistry,
  ) {}

  requestExport(
    caller: AuthenticatedUser,
    userId: string | undefined,
  ): Promise<PrivacyRequestView> {
    const subjectId = userId ?? caller.id;

    this.assertMayActFor(caller, subjectId);

    return this.open('export', subjectId, caller);
  }

  requestUserErasure(
    caller: AuthenticatedUser,
    userId: string,
  ): Promise<PrivacyRequestView> {
    this.assertMayActFor(caller, userId);

    return this.open('erase-user', userId, caller);
  }

  requestTenantErasure(
    caller: AuthenticatedUser,
    confirm: string,
  ): Promise<PrivacyRequestView> {
    const tenantId = TenantContextStorage.getTenantId();

    if (confirm !== tenantId) {
      throw new TenantErasureNotConfirmedException();
    }

    return this.open('erase-tenant', tenantId, caller);
  }

  /**
   * The history an operator reads: every request of the tenant for an admin,
   * the caller's own for anyone else. The bundle is never part of a listing.
   */
  async page(caller: AuthenticatedUser, page: PageQuery) {
    const where = caller.role === 'admin' ? {} : { requestedBy: caller.id };
    const [rows, total] = await Promise.all([
      this.prisma.privacyRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.privacyRequest.count({ where }),
    ]);

    return { records: rows.map((row) => this.view(row)), total };
  }

  /**
   * An export's bundle is handed over once. It sits in the request row only
   * until somebody collects it, because leaving a copy of a person's data in
   * a table indefinitely would be its own exposure; asking again is a new
   * export.
   */
  async find(
    caller: AuthenticatedUser,
    id: string,
  ): Promise<PrivacyRequestView> {
    const row = await this.prisma.privacyRequest.findFirst({ where: { id } });

    if (!row || (row.requestedBy !== caller.id && caller.role !== 'admin')) {
      throw new RecordNotFoundException('privacyRequest');
    }

    const view = this.view(row);

    if (row.status !== 'done' || row.result === null) {
      return view;
    }

    const claimed = await this.prisma.privacyRequest.updateMany({
      where: { id, deliveredAt: null },
      data: { result: Prisma.DbNull, deliveredAt: new Date() },
    });

    return claimed.count === 1 ? { ...view, result: row.result } : view;
  }

  private assertMayActFor(caller: AuthenticatedUser, subjectId: string): void {
    if (subjectId !== caller.id && caller.role !== 'admin') {
      throw new CapabilityForbiddenException();
    }
  }

  private async open(
    kind: PrivacyRequestKind,
    subjectId: string,
    caller: AuthenticatedUser,
  ): Promise<PrivacyRequestView> {
    const tenantId = TenantContextStorage.getTenantId();
    const row = await this.prisma.privacyRequest.create({
      data: { tenantId, kind, subjectId, requestedBy: caller.id },
    });

    // The entry names the request and who it concerns, never what it will
    // touch: an erasure must leave a trail that does not carry the data.
    await writeAuditLog(authPrismaClient, {
      tenantId,
      model: 'PrivacyRequest',
      operation: `privacy.${kind}.requested`,
      recordId: row.id,
      data: { subjectId },
      userId: caller.id,
      impersonatedBy: caller.impersonatedBy,
    });

    const data: PrivacyJobData = {
      requestId: row.id,
      tenantId,
      userId: caller.id,
      impersonatedBy: caller.impersonatedBy,
      models: this.registry.all().map((declaration) => declaration.model),
    };

    try {
      await this.jobs.dispatchTo(
        PRIVACY_QUEUE,
        PRIVACY_PROCESS_JOB,
        data,
        PRIVACY_PROCESS_POLICY,
      );
    } catch (error) {
      await this.prisma.privacyRequest.update({
        where: { id: row.id },
        data: {
          status: 'failed',
          error: String((error as Error).message).slice(0, ERROR_MAX_LENGTH),
        },
      });

      throw error;
    }

    return this.view(row);
  }

  private view(row: PrivacyRequestRow): PrivacyRequestView {
    return {
      id: row.id,
      kind: row.kind as PrivacyRequestKind,
      status: row.status as PrivacyRequestStatus,
      subjectId: row.subjectId,
      summary: row.summary,
      error: row.error,
      createdAt: row.createdAt,
      completedAt: row.completedAt,
      deliveredAt: row.deliveredAt,
    };
  }
}
