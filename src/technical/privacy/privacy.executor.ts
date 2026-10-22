import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { redactAuditEntries } from '#technical/audit/audit-redaction';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { RecordNotFoundException } from '#technical/errors/record-not-found.exception';
import { PRISMA_CLIENT } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import { isTenantFileKey } from '#technical/tenancy/tenant-file-key';
import {
  anonymisedData,
  erasedSlug,
  PersonalDataRegistry,
  personalSlugFields,
} from './personal-data.registry';
import type {
  PersonalDataDeclaration,
  PersonalDataField,
  PersonalDataSubject,
} from './personal-data.types';

const TOMBSTONE_DOMAIN = 'erased.invalid';
const TOMBSTONE_REASON = 'erased';
const USER_BATCH_SIZE = 500;
const SNAPSHOT_ID_CHUNK_SIZE = 1000;

type Row = Record<string, unknown>;

interface RowDelegate {
  findMany(args: unknown): Promise<Row[]>;
  deleteMany(args: unknown): Promise<{ count: number }>;
  updateMany(args: unknown): Promise<{ count: number }>;
}

interface IdentityDelegate {
  deleteMany(args: unknown): Promise<{ count: number }>;
}

export interface ExportOutcome {
  result: Prisma.InputJsonValue;
  summary: { resources: Record<string, number> };
}

export interface ErasureOutcome {
  summary: {
    resources: Record<string, number>;
    auditEntriesRedacted: number;
    snapshotsPurged: number;
    filesRemoved: number;
    identities: number;
  };
}

function delegateFor<T>(client: object, model: string): T {
  const key = model.charAt(0).toLowerCase() + model.slice(1);

  return (client as unknown as Record<string, T>)[key]!;
}

/**
 * Every table that hangs off a user and dies with it: sessions, accounts,
 * keys, second factors, notification settings. Read off Prisma's own DMMF --
 * a `user` relation backed by a `userId` column -- so a table added later is
 * erased with the user without anyone remembering to list it. Resources a
 * blueprint generated are not here: they point at their owner through
 * `ownerId`, and answer through their declaration.
 */
export function userKeyedModels(): string[] {
  return Prisma.dmmf.datamodel.models
    .filter((model) => {
      const names = new Set(model.fields.map((field) => field.name));

      return (
        names.has('userId') &&
        model.fields.some(
          (field) =>
            field.kind === 'object' &&
            !field.isList &&
            field.name === 'user' &&
            field.type === 'User',
        )
      );
    })
    .map((model) => model.name);
}

function pseudonymFor(userId: string): string {
  const digest = createHash('sha256').update(userId).digest('hex');

  return `erased-${digest.slice(0, 24)}@${TOMBSTONE_DOMAIN}`;
}

function chunked<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }

  return chunks;
}

/**
 * The work behind a privacy request, run by a queue worker inside the
 * requester's tenant context. Resource rows go through the tenant-scoped
 * client, so the boundary, row-level security and the audit extension apply
 * to an erasure exactly as they do to any other write; the identity record and
 * the audit chain are kernel tables and are reached directly.
 */
@Injectable()
export class PrivacyExecutor {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
    private readonly registry: PersonalDataRegistry,
  ) {}

  async exportUser(tenantId: string, userId: string): Promise<ExportOutcome> {
    const identity = await authPrismaClient.user.findFirst({
      where: { id: userId, tenantId },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        phoneNumber: true,
        createdAt: true,
      },
    });

    if (!identity) {
      throw new RecordNotFoundException('user');
    }

    const resources: Record<string, unknown[]> = {};

    for (const declaration of this.registry.all()) {
      const rows = await this.rowsOf(declaration).findMany({
        where: { ownerId: userId },
        orderBy: { createdAt: 'asc' },
      });

      resources[declaration.model] = rows.map((row) =>
        this.exportedRow(declaration, row),
      );
    }

    const subject = this.subjectOf(tenantId, identity);

    for (const hook of this.registry.hooks()) {
      resources[hook.name] = await hook.exportUser(subject);
    }

    return {
      // A bundle is JSON by the time it is stored; round-tripping here turns
      // dates into strings once instead of leaving it to the column.
      result: JSON.parse(
        JSON.stringify({
          exportedAt: new Date(),
          identity,
          resources,
        }),
      ) as Prisma.InputJsonValue,
      summary: {
        resources: Object.fromEntries(
          Object.entries(resources).map(([model, rows]) => [
            model,
            rows.length,
          ]),
        ),
      },
    };
  }

  async eraseUser(tenantId: string, userId: string): Promise<ErasureOutcome> {
    const identity = await authPrismaClient.user.findFirst({
      where: { id: userId, tenantId },
      select: { id: true, email: true, phoneNumber: true },
    });

    if (!identity) {
      throw new RecordNotFoundException('user');
    }

    const resources: Record<string, number> = {};
    let auditEntriesRedacted = 0;
    let snapshotsPurged = 0;
    let filesRemoved = 0;

    for (const declaration of this.registry.all()) {
      const delegate = this.rowsOf(declaration);
      const where = { ownerId: userId };
      const ids = (
        await delegate.findMany({ where, select: { id: true } })
      ).map((row) => row.id as string);

      // The audit entries go first. A retry after a failure finds no rows left
      // to name, so redacting afterwards would leave the entries of rows an
      // earlier attempt already deleted.
      auditEntriesRedacted += await redactAuditEntries(authPrismaClient, {
        tenantId,
        models: [declaration.model],
        recordIds: ids,
      });
      snapshotsPurged += await this.purgeSnapshots(
        tenantId,
        declaration.model,
        ids,
      );
      const keys = await this.fileKeys(tenantId, declaration, delegate, where);

      resources[declaration.model] = await this.erase(
        declaration,
        delegate,
        where,
      );
      filesRemoved += await this.removeFiles(keys);
    }

    const subject = this.subjectOf(tenantId, identity);

    for (const hook of this.registry.hooks()) {
      resources[hook.name] = await hook.eraseUser(subject);
    }

    return {
      summary: {
        resources,
        auditEntriesRedacted,
        snapshotsPurged,
        filesRemoved,
        identities: await this.tombstone(tenantId, [userId]),
      },
    };
  }

  /**
   * Every user of the tenant but the one who asked: that account keeps the
   * session the requester reads the outcome with, and is erased by an erasure
   * of that user once the outcome has been read.
   */
  async eraseTenant(
    tenantId: string,
    requesterId: string | null,
  ): Promise<ErasureOutcome> {
    const resources: Record<string, number> = {};
    let auditEntriesRedacted = 0;
    let filesRemoved = 0;

    for (const declaration of this.registry.all()) {
      const delegate = this.rowsOf(declaration);

      auditEntriesRedacted += await redactAuditEntries(authPrismaClient, {
        tenantId,
        models: [declaration.model],
      });
      const keys = await this.fileKeys(tenantId, declaration, delegate, {});

      resources[declaration.model] = await this.erase(
        declaration,
        delegate,
        {},
      );
      filesRemoved += await this.removeFiles(keys);
    }

    for (const hook of this.registry.hooks()) {
      resources[hook.name] = await hook.eraseTenant(tenantId, requesterId);
    }

    const snapshotsPurged = (
      await authPrismaClient.recordSnapshot.deleteMany({ where: { tenantId } })
    ).count;

    const users = await authPrismaClient.user.findMany({
      where: {
        tenantId,
        ...(requesterId === null ? {} : { id: { not: requesterId } }),
      },
      select: { id: true },
    });
    let identities = 0;

    for (const batch of chunked(
      users.map((user) => user.id),
      USER_BATCH_SIZE,
    )) {
      identities += await this.tombstone(tenantId, batch);
    }

    return {
      summary: {
        resources,
        auditEntriesRedacted,
        snapshotsPurged,
        filesRemoved,
        identities,
      },
    };
  }

  /**
   * A row's history keeps every value it ever held, and a revert writes one
   * back: an erased row loses its snapshots before the row itself is touched,
   * for the same retry reason as the audit entries.
   */
  private async purgeSnapshots(
    tenantId: string,
    model: string,
    recordIds: readonly string[],
  ): Promise<number> {
    let purged = 0;

    for (const chunk of chunked(recordIds, SNAPSHOT_ID_CHUNK_SIZE)) {
      purged += (
        await authPrismaClient.recordSnapshot.deleteMany({
          where: { tenantId, model, recordId: { in: chunk } },
        })
      ).count;
    }

    return purged;
  }

  private subjectOf(
    tenantId: string,
    identity: { id: string; email: string; phoneNumber: string | null },
  ): PersonalDataSubject {
    return {
      tenantId,
      userId: identity.id,
      email: identity.email,
      phoneNumber: identity.phoneNumber,
    };
  }

  /**
   * The objects behind the `file` fields an erasure is about to clear: every
   * one when the row is deleted, the personal ones when it is anonymised. Read
   * before the rows change, removed after, so a failed erasure leaves the row
   * pointing at an object that still exists. A key outside the tenant's prefix
   * names someone else's object, so it is cleared from the row but never
   * removed.
   */
  private async fileKeys(
    tenantId: string,
    declaration: PersonalDataDeclaration,
    delegate: RowDelegate,
    where: Row,
  ): Promise<string[]> {
    const fields = declaration.fields.filter(
      (field: PersonalDataField) =>
        field.type === 'file' &&
        (declaration.erase === 'delete' || field.personal),
    );

    if (fields.length === 0 || this.registry.fileRemover() === null) {
      return [];
    }

    const rows = await delegate.findMany({
      where,
      select: Object.fromEntries(fields.map((field) => [field.name, true])),
    });

    return rows.flatMap((row) =>
      fields
        .map((field) => row[field.name])
        .filter(
          (key): key is string =>
            typeof key === 'string' && isTenantFileKey(key, tenantId),
        ),
    );
  }

  private async removeFiles(keys: readonly string[]): Promise<number> {
    const remove = this.registry.fileRemover();

    if (remove === null) {
      return 0;
    }

    for (const key of keys) {
      await remove(key);
    }

    return keys.length;
  }

  private rowsOf(declaration: PersonalDataDeclaration): RowDelegate {
    return delegateFor<RowDelegate>(this.prisma, declaration.model);
  }

  private exportedRow(declaration: PersonalDataDeclaration, row: Row): Row {
    const exported: Row = {};

    for (const key of ['id', 'createdAt', 'updatedAt', 'deletedAt']) {
      if (key in row) {
        exported[key] = row[key];
      }
    }

    for (const field of declaration.fields) {
      exported[field.name] = row[field.name];
    }

    return exported;
  }

  private async erase(
    declaration: PersonalDataDeclaration,
    delegate: RowDelegate,
    where: Row,
  ): Promise<number> {
    if (declaration.erase === 'delete') {
      return (await delegate.deleteMany({ where })).count;
    }

    const slugs = personalSlugFields(declaration);

    if (slugs.length > 0) {
      const rows = await delegate.findMany({ where, select: { id: true } });

      for (const row of rows) {
        const id = String(row.id);

        // updateMany and not update: an update is audited against the row,
        // and the entry would keep the erased slug next to the redacted ones.
        await delegate.updateMany({
          where: { id },
          data: Object.fromEntries(
            slugs.map((field) => [field.name, erasedSlug(id)]),
          ),
        });
      }
    }

    return (
      await delegate.updateMany({ where, data: anonymisedData(declaration) })
    ).count;
  }

  /**
   * Deletes what hangs off each user and rewrites the user row to a tombstone:
   * the id stays, because resources and the audit chain still point at it, but
   * nothing on the row identifies anyone, and a banned account with no
   * credentials cannot sign in again.
   */
  private tombstone(tenantId: string, userIds: string[]): Promise<number> {
    return authPrismaClient.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;

      for (const model of userKeyedModels()) {
        await delegateFor<IdentityDelegate>(tx, model).deleteMany({
          where: { userId: { in: userIds } },
        });
      }

      for (const id of userIds) {
        await tx.user.update({
          where: { id },
          data: {
            email: pseudonymFor(id),
            emailVerified: false,
            name: null,
            image: null,
            phoneNumber: null,
            phoneNumberVerified: false,
            twoFactorEnabled: false,
            banned: true,
            banReason: TOMBSTONE_REASON,
            banExpires: null,
          },
        });
      }

      return userIds.length;
    });
  }
}
