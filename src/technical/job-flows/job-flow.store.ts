import { Inject, Injectable } from '@nestjs/common';
import { PRISMA_CLIENT } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import type { Page, PageQuery } from '#technical/http/page-query';
import type { FlowKind, FlowStepRef } from './job-flow.types';

export interface JobFlowRow {
  id: string;
  tenantId: string;
  kind: FlowKind;
  name: string;
  queue: string;
  rootJobId: string;
  steps: FlowStepRef[];
  createdById: string | null;
  createdAt: Date;
  cancelledAt: Date | null;
}

export interface NewJobFlow {
  tenantId: string;
  kind: FlowKind;
  name: string;
  queue: string;
  rootJobId: string;
  steps: FlowStepRef[];
  createdById: string | null;
}

/**
 * Every read and write names the tenant: the table is app-enforced because a
 * flow can be started from a worker, with no request around it to read a
 * tenant from. The registry only remembers which jobs belong together -- what
 * state they are in is always asked of the queue.
 */
@Injectable()
export class JobFlowStore {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  async create(flow: NewJobFlow): Promise<JobFlowRow> {
    const row = await this.prisma.jobFlow.create({
      data: { ...flow, steps: flow.steps as unknown as object },
    });

    return toRow(row);
  }

  async find(tenantId: string, id: string): Promise<JobFlowRow | null> {
    const row = await this.prisma.jobFlow.findFirst({
      where: { id, tenantId },
    });

    return row ? toRow(row) : null;
  }

  async list(tenantId: string, page: PageQuery): Promise<Page<JobFlowRow>> {
    const [rows, total] = await Promise.all([
      this.prisma.jobFlow.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.jobFlow.count({ where: { tenantId } }),
    ]);

    return { records: rows.map(toRow), total };
  }

  async markCancelled(tenantId: string, id: string): Promise<void> {
    await this.prisma.jobFlow.updateMany({
      where: { id, tenantId, cancelledAt: null },
      data: { cancelledAt: new Date() },
    });
  }

  async prune(olderThan: Date): Promise<number> {
    const { count } = await this.prisma.jobFlow.deleteMany({
      where: { createdAt: { lt: olderThan } },
    });

    return count;
  }
}

function toRow(row: {
  id: string;
  tenantId: string;
  kind: string;
  name: string;
  queue: string;
  rootJobId: string;
  steps: unknown;
  createdById: string | null;
  createdAt: Date;
  cancelledAt: Date | null;
}): JobFlowRow {
  return {
    ...row,
    kind: row.kind as FlowKind,
    steps: row.steps as FlowStepRef[],
  };
}
