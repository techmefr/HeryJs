import { Inject, Injectable } from '@nestjs/common';
import type { AuditSink } from '@prisma/client';
import { AuditSinkRefusedException } from '#technical/errors/audit-sink-refused.exception';
import { RecordNotFoundException } from '#technical/errors/record-not-found.exception';
import type { PageQuery } from '#technical/http/page-query';
import { DriverResolver } from '#technical/drivers/driver-resolver';
import { PRISMA_CLIENT } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import { SecretsService } from '#technical/secrets/secrets.service';
import { STORAGE_MODULE } from '#technical/storage/storage-driver';
import { assertSinkUrl } from './audit-sink-url';
import {
  AUDIT_SINK_KIND_HTTP,
  AUDIT_SINK_KIND_STORAGE,
  AUDIT_SINK_SECRET_CONTEXT,
  DEFAULT_STORAGE_DRIVER,
} from './audit-sink.constants';
import { AUDIT_SINK_OPTIONS, AuditSinkDelivery } from './audit-sink.delivery';
import type { AuditSinkOptions } from './audit-sink.delivery';
import type {
  CreateAuditSinkInput,
  UpdateAuditSinkInput,
} from './audit-sink.schema';
import { AuditStreamService } from './audit-stream.service';

const RESOURCE = 'Audit sink';

export interface AuditSinkView {
  id: string;
  name: string;
  kind: string;
  url: string | null;
  storageDriver: string | null;
  keyPrefix: string | null;
  active: boolean;
  hasAuthToken: boolean;
  cursor: number;
  lastError: string | null;
  lastDeliveredAt: Date | null;
  lastDeliveredSequence: number | null;
  createdAt: Date;
}

export interface AuditSinkProbe {
  ok: boolean;
  error: string | null;
}

/**
 * The sealed token never leaves this class: the view carries only whether one
 * is set, so a list, a read or an error cannot disclose it, and changing it is
 * a write of a new value rather than an edit of the old one.
 */
export function auditSinkView(sink: AuditSink): AuditSinkView {
  return {
    id: sink.id,
    name: sink.name,
    kind: sink.kind,
    url: sink.url,
    storageDriver: sink.storageDriver,
    keyPrefix: sink.keyPrefix,
    active: sink.active,
    hasAuthToken: sink.authToken !== null,
    cursor: sink.cursor,
    lastError: sink.lastError,
    lastDeliveredAt: sink.lastDeliveredAt,
    lastDeliveredSequence: sink.lastDeliveredSequence,
    createdAt: sink.createdAt,
  };
}

@Injectable()
export class AuditSinkService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
    private readonly secrets: SecretsService,
    private readonly drivers: DriverResolver,
    private readonly delivery: AuditSinkDelivery,
    private readonly stream: AuditStreamService,
    @Inject(AUDIT_SINK_OPTIONS) private readonly options: AuditSinkOptions,
  ) {}

  async page(tenantId: string, page: PageQuery) {
    const where = { tenantId };

    const [records, total] = await Promise.all([
      this.prisma.auditSink.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.auditSink.count({ where }),
    ]);

    return { records: records.map(auditSinkView), total };
  }

  async create(
    tenantId: string,
    input: CreateAuditSinkInput,
  ): Promise<AuditSinkView> {
    const isHttp = input.kind === AUDIT_SINK_KIND_HTTP;

    if (isHttp && input.url) {
      await this.assertUrl(input.url);
    }

    const storageDriver = isHttp
      ? null
      : (input.storageDriver ?? DEFAULT_STORAGE_DRIVER);

    if (storageDriver) {
      this.assertDriver(storageDriver);
    }

    const cursor = input.backfill ? 0 : await this.tailOf(tenantId);
    const sink = await this.prisma.auditSink.create({
      data: {
        tenantId,
        name: input.name,
        kind: input.kind,
        url: isHttp ? (input.url ?? null) : null,
        authToken:
          isHttp && input.authToken ? this.seal(input.authToken) : null,
        storageDriver,
        keyPrefix: isHttp ? null : (input.keyPrefix ?? 'audit'),
        active: input.active ?? true,
        cursor,
      },
    });

    return auditSinkView(sink);
  }

  async update(
    tenantId: string,
    id: string,
    input: UpdateAuditSinkInput,
  ): Promise<AuditSinkView> {
    const sink = await this.find(tenantId, id);
    const isStorage = sink.kind === AUDIT_SINK_KIND_STORAGE;

    if (isStorage && (input.url !== undefined || input.authToken)) {
      throw new AuditSinkRefusedException('a storage sink has no url or token');
    }

    if (!isStorage && input.storageDriver !== undefined) {
      throw new AuditSinkRefusedException('an http sink has no storage driver');
    }

    if (input.url !== undefined) {
      await this.assertUrl(input.url);
    }

    if (input.storageDriver !== undefined) {
      this.assertDriver(input.storageDriver);
    }

    const updated = await this.prisma.auditSink.update({
      where: { id: sink.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.url !== undefined ? { url: input.url } : {}),
        ...(input.authToken !== undefined
          ? {
              authToken:
                input.authToken === null ? null : this.seal(input.authToken),
            }
          : {}),
        ...(input.storageDriver !== undefined
          ? { storageDriver: input.storageDriver }
          : {}),
        ...(input.keyPrefix !== undefined
          ? { keyPrefix: input.keyPrefix }
          : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    });

    return auditSinkView(updated);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const sink = await this.find(tenantId, id);

    await this.prisma.auditSink.delete({ where: { id: sink.id } });
  }

  /**
   * Sends an empty batch through the real transport, so what the operator
   * learns is whether the URL, the token and the driver work together -- not
   * whether the form validated.
   */
  async probe(tenantId: string, id: string): Promise<AuditSinkProbe> {
    const sink = await this.find(tenantId, id);

    try {
      await this.delivery.send(sink, {
        fromSequence: 0,
        toSequence: 0,
        entries: [],
      });

      return { ok: true, error: null };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async flush(tenantId: string, id: string): Promise<number> {
    const sink = await this.find(tenantId, id);

    return this.stream.streamSink(sink.id);
  }

  private async find(tenantId: string, id: string): Promise<AuditSink> {
    const sink = await this.prisma.auditSink.findFirst({
      where: { id, tenantId },
    });

    if (!sink) {
      throw new RecordNotFoundException(RESOURCE);
    }

    return sink;
  }

  private async tailOf(tenantId: string): Promise<number> {
    const tail = await this.prisma.auditLog.aggregate({
      where: { tenantId },
      _max: { sequence: true },
    });

    return tail._max.sequence ?? 0;
  }

  private seal(token: string): string {
    return this.secrets.encrypt(token, AUDIT_SINK_SECRET_CONTEXT);
  }

  private assertUrl(url: string): Promise<void> {
    return assertSinkUrl(url, {
      allowPrivate: this.options.allowPrivateHosts,
      resolve: this.options.resolve,
    });
  }

  private assertDriver(driverName: string): void {
    if (!this.drivers.find(STORAGE_MODULE, driverName)) {
      throw new AuditSinkRefusedException(
        `no storage driver named "${driverName}" is installed`,
      );
    }
  }
}
