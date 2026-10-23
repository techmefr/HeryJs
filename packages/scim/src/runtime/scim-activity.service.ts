import { Inject, Injectable } from '@nestjs/common';
import { writeAuditLog } from '@heryjs/core/privacy';
import { authPrismaClient } from '@heryjs/core/auth';
import type { PageQuery } from '@heryjs/core/http';
import {
  PRISMA_CLIENT,
  type TenantScopedPrismaClient,
} from '@heryjs/core/database';
import type { ScimResourceKind } from './scim.types';

export const SCIM_ACTIVITY_MODELS = ['ScimUser', 'ScimGroup', 'ScimToken'];

export interface ScimActivityEntry {
  id: string;
  at: Date;
  resource: string;
  action: string;
  resourceId: string | null;
  detail: string | null;
}

/**
 * What the directory did, kept in the tenant's audit chain so it is tamper
 * evident, and read back from it for the admin. Recording never fails a
 * provisioning call: a directory that got a 500 would retry a write that
 * already happened.
 */
@Injectable()
export class ScimActivityService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  async record(
    tenantId: string,
    entry: {
      resource: ScimResourceKind | 'token';
      action: string;
      resourceId: string | null;
      detail?: string;
    },
  ): Promise<void> {
    try {
      await writeAuditLog(authPrismaClient, {
        tenantId,
        model: this.modelOf(entry.resource),
        operation: entry.action,
        recordId: entry.resourceId,
        data: entry.detail ? { detail: entry.detail } : {},
        userId: null,
        impersonatedBy: null,
      });
    } catch {
      return;
    }
  }

  async page(
    tenantId: string,
    page: PageQuery,
  ): Promise<{ records: ScimActivityEntry[]; total: number }> {
    const where = { tenantId, model: { in: SCIM_ACTIVITY_MODELS } };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { sequence: 'desc' },
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      records: rows.map((row) => ({
        id: row.id,
        at: row.createdAt,
        resource: row.model.replace(/^Scim/, '').toLowerCase(),
        action: row.operation,
        resourceId: row.recordId,
        detail: this.detailOf(row.data),
      })),
      total,
    };
  }

  private modelOf(resource: ScimResourceKind | 'token'): string {
    return resource === 'user'
      ? 'ScimUser'
      : resource === 'group'
        ? 'ScimGroup'
        : 'ScimToken';
  }

  private detailOf(data: unknown): string | null {
    const detail = (data as { detail?: unknown } | null)?.detail;

    return typeof detail === 'string' ? detail : null;
  }
}
