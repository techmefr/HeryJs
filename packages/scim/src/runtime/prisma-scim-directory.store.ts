import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PRISMA_CLIENT } from '#kernel/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#kernel/prisma/prisma.client';
import { runInTenant } from '#kernel/tenancy/run-in-tenant';
import { ScimException } from './scim.exception';
import { SCIM_DEACTIVATION_REASON } from './scim.types';
import type {
  ScimGroupInput,
  ScimGroupRow,
  ScimListQuery,
  ScimPage,
  ScimResourceKind,
  ScimUserInput,
  ScimUserRow,
} from './scim.types';
import type { ScimDirectoryStore } from './scim-directory.store';

const UNIQUE_VIOLATION = 'P2002';

interface UserRecord {
  id: string;
  email: string;
  name: string | null;
  banned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface IdentityRecord {
  resourceId: string;
  externalId: string | null;
  givenName: string | null;
  familyName: string | null;
}

const ORDER = [{ createdAt: 'asc' as const }, { id: 'asc' as const }];

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === UNIQUE_VIOLATION
  );
}

function toUser(record: UserRecord, identity?: IdentityRecord): ScimUserRow {
  return {
    id: record.id,
    email: record.email,
    name: record.name,
    givenName: identity?.givenName ?? null,
    familyName: identity?.familyName ?? null,
    externalId: identity?.externalId ?? null,
    isActive: !record.banned,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

@Injectable()
export class PrismaScimDirectoryStore implements ScimDirectoryStore {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  listUsers(
    tenantId: string,
    query: ScimListQuery,
  ): Promise<ScimPage<ScimUserRow>> {
    return runInTenant(tenantId, async () => {
      const where = await this.userWhere(tenantId, query);
      const [records, total] = await Promise.all([
        this.prisma.user.findMany({
          where,
          orderBy: ORDER,
          skip: query.startIndex - 1,
          take: query.count,
        }),
        this.prisma.user.count({ where }),
      ]);
      const identities = await this.identities(
        tenantId,
        'user',
        records.map((record) => record.id),
      );

      return {
        rows: records.map((record) =>
          toUser(record, identities.get(record.id)),
        ),
        total,
      };
    });
  }

  findUser(tenantId: string, id: string): Promise<ScimUserRow | null> {
    return runInTenant(tenantId, () => this.loadUser(tenantId, id));
  }

  createUser(tenantId: string, input: ScimUserInput): Promise<ScimUserRow> {
    return runInTenant(tenantId, async () => {
      await this.assertExternalIdFree(tenantId, 'user', input.externalId, null);

      try {
        const record = await this.prisma.user.create({
          data: {
            email: input.email,
            name: input.name,
            emailVerified: true,
            ...(input.isActive
              ? {}
              : { banned: true, banReason: SCIM_DEACTIVATION_REASON }),
          },
        });

        await this.saveIdentity(tenantId, 'user', record.id, input);

        return (await this.loadUser(tenantId, record.id)) ?? toUser(record);
      } catch (error) {
        throw this.translate(error, 'userName');
      }
    });
  }

  updateUser(
    tenantId: string,
    id: string,
    input: ScimUserInput,
  ): Promise<ScimUserRow | null> {
    return runInTenant(tenantId, async () => {
      const current = await this.prisma.user.findUnique({ where: { id } });

      if (!current) {
        return null;
      }

      await this.assertExternalIdFree(tenantId, 'user', input.externalId, id);

      try {
        await this.prisma.user.update({
          where: { id },
          data: {
            email: input.email,
            name: input.name,
            ...this.banChange(current, input.isActive),
          },
        });
      } catch (error) {
        throw this.translate(error, 'userName');
      }

      await this.saveIdentity(tenantId, 'user', id, input);

      if (current.banned === false && !input.isActive) {
        await this.prisma.session.deleteMany({ where: { userId: id } });
      }

      return this.loadUser(tenantId, id);
    });
  }

  async existingUserIds(tenantId: string, ids: string[]): Promise<string[]> {
    const records = await runInTenant(tenantId, () =>
      this.prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      }),
    );

    return records.map((record) => record.id);
  }

  listGroups(
    tenantId: string,
    query: ScimListQuery,
  ): Promise<ScimPage<ScimGroupRow>> {
    return runInTenant(tenantId, async () => {
      const where = await this.groupWhere(tenantId, query);
      const [records, total] = await Promise.all([
        this.prisma.team.findMany({
          where,
          orderBy: ORDER,
          skip: query.startIndex - 1,
          take: query.count,
          include: {
            members: { include: { user: { select: { email: true } } } },
          },
        }),
        this.prisma.team.count({ where }),
      ]);
      const identities = await this.identities(
        tenantId,
        'group',
        records.map((record) => record.id),
      );

      return {
        rows: records.map((record) =>
          this.toGroup(record, identities.get(record.id)),
        ),
        total,
      };
    });
  }

  findGroup(tenantId: string, id: string): Promise<ScimGroupRow | null> {
    return runInTenant(tenantId, () => this.loadGroup(tenantId, id));
  }

  createGroup(tenantId: string, input: ScimGroupInput): Promise<ScimGroupRow> {
    return runInTenant(tenantId, async () => {
      await this.assertExternalIdFree(
        tenantId,
        'group',
        input.externalId,
        null,
      );

      const team = await this.prisma.team.create({
        data: { name: input.name },
      });

      await this.setMembers(team.id, input.memberIds);
      await this.saveIdentity(tenantId, 'group', team.id, input);

      const row = await this.loadGroup(tenantId, team.id);

      if (!row) {
        throw ScimException.notFound('group');
      }

      return row;
    });
  }

  updateGroup(
    tenantId: string,
    id: string,
    input: ScimGroupInput,
  ): Promise<ScimGroupRow | null> {
    return runInTenant(tenantId, async () => {
      const team = await this.prisma.team.findUnique({ where: { id } });

      if (!team) {
        return null;
      }

      await this.assertExternalIdFree(tenantId, 'group', input.externalId, id);
      await this.prisma.team.update({
        where: { id },
        data: { name: input.name },
      });
      await this.setMembers(id, input.memberIds);
      await this.saveIdentity(tenantId, 'group', id, input);

      return this.loadGroup(tenantId, id);
    });
  }

  deleteGroup(tenantId: string, id: string): Promise<boolean> {
    return runInTenant(tenantId, async () => {
      const team = await this.prisma.team.findUnique({ where: { id } });

      if (!team) {
        return false;
      }

      await this.prisma.team.delete({ where: { id } });
      await this.prisma.scimIdentity.deleteMany({
        where: { tenantId, kind: 'group', resourceId: id },
      });

      return true;
    });
  }

  private banChange(
    current: { banned: boolean; banReason: string | null },
    isActive: boolean,
  ): { banned?: boolean; banReason?: string | null } {
    if (!isActive) {
      return current.banned
        ? {}
        : { banned: true, banReason: SCIM_DEACTIVATION_REASON };
    }

    // An account an administrator banned for their own reasons stays banned:
    // the directory can undo only the deactivation it made itself.
    return current.banned && current.banReason === SCIM_DEACTIVATION_REASON
      ? { banned: false, banReason: null }
      : {};
  }

  private async userWhere(
    tenantId: string,
    query: ScimListQuery,
  ): Promise<Prisma.UserWhereInput> {
    const filter = query.filter;

    if (!filter) {
      return {};
    }

    if (filter.attribute === 'username') {
      return { email: { equals: filter.value, mode: 'insensitive' } };
    }

    return {
      id: { in: await this.idsByExternalId(tenantId, 'user', filter.value) },
    };
  }

  private async groupWhere(
    tenantId: string,
    query: ScimListQuery,
  ): Promise<Prisma.TeamWhereInput> {
    const filter = query.filter;

    if (!filter) {
      return {};
    }

    if (filter.attribute === 'displayname') {
      return { name: { equals: filter.value, mode: 'insensitive' } };
    }

    return {
      id: { in: await this.idsByExternalId(tenantId, 'group', filter.value) },
    };
  }

  private async idsByExternalId(
    tenantId: string,
    kind: ScimResourceKind,
    externalId: string,
  ): Promise<string[]> {
    const rows = await this.prisma.scimIdentity.findMany({
      where: { tenantId, kind, externalId },
      select: { resourceId: true },
    });

    return rows.map((row) => row.resourceId);
  }

  private async identities(
    tenantId: string,
    kind: ScimResourceKind,
    ids: string[],
  ): Promise<Map<string, IdentityRecord>> {
    if (ids.length === 0) {
      return new Map();
    }

    const rows = await this.prisma.scimIdentity.findMany({
      where: { tenantId, kind, resourceId: { in: ids } },
    });

    return new Map(rows.map((row) => [row.resourceId, row]));
  }

  private async loadUser(
    tenantId: string,
    id: string,
  ): Promise<ScimUserRow | null> {
    const record = await this.prisma.user.findUnique({ where: { id } });

    if (!record) {
      return null;
    }

    return toUser(
      record,
      (await this.identities(tenantId, 'user', [id])).get(id),
    );
  }

  private async loadGroup(
    tenantId: string,
    id: string,
  ): Promise<ScimGroupRow | null> {
    const record = await this.prisma.team.findUnique({
      where: { id },
      include: { members: { include: { user: { select: { email: true } } } } },
    });

    return record
      ? this.toGroup(
          record,
          (await this.identities(tenantId, 'group', [id])).get(id),
        )
      : null;
  }

  private toGroup(
    record: {
      id: string;
      name: string;
      createdAt: Date;
      updatedAt: Date;
      members: Array<{ userId: string; user: { email: string } }>;
    },
    identity?: IdentityRecord,
  ): ScimGroupRow {
    return {
      id: record.id,
      name: record.name,
      externalId: identity?.externalId ?? null,
      members: record.members.map((member) => ({
        id: member.userId,
        email: member.user.email,
      })),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private async setMembers(teamId: string, memberIds: string[]): Promise<void> {
    await this.prisma.teamMember.deleteMany({
      where: { teamId, userId: { notIn: memberIds } },
    });

    if (memberIds.length > 0) {
      await this.prisma.teamMember.createMany({
        data: memberIds.map((userId) => ({ teamId, userId })),
        skipDuplicates: true,
      });
    }
  }

  private async saveIdentity(
    tenantId: string,
    kind: ScimResourceKind,
    resourceId: string,
    input: {
      externalId: string | null;
      givenName?: string | null;
      familyName?: string | null;
    },
  ): Promise<void> {
    const data = {
      externalId: input.externalId,
      givenName: input.givenName ?? null,
      familyName: input.familyName ?? null,
    };

    await this.prisma.scimIdentity.upsert({
      where: { tenantId_kind_resourceId: { tenantId, kind, resourceId } },
      create: { tenantId, kind, resourceId, ...data },
      update: data,
    });
  }

  private async assertExternalIdFree(
    tenantId: string,
    kind: ScimResourceKind,
    externalId: string | null,
    ownId: string | null,
  ): Promise<void> {
    if (!externalId) {
      return;
    }

    const holders = await this.idsByExternalId(tenantId, kind, externalId);

    if (holders.some((holder) => holder !== ownId)) {
      throw ScimException.conflict(
        'externalId is already used by another resource.',
      );
    }
  }

  private translate(error: unknown, attribute: string): unknown {
    return isUniqueViolation(error)
      ? ScimException.conflict(`${attribute} is already taken.`)
      : error;
  }
}
