import { randomUUID } from 'node:crypto';
import { ScimException } from './scim.exception';
import type {
  ScimGroupInput,
  ScimGroupRow,
  ScimListQuery,
  ScimPage,
  ScimUserInput,
  ScimUserRow,
} from './scim.types';
import type { ScimDirectoryStore } from './scim-directory.store';
import type { ScimTokenRecord, ScimTokenStore } from './scim-token.service';

export class InMemoryScimTokenStore implements ScimTokenStore {
  readonly records = new Map<string, ScimTokenRecord>();

  findByHash(tokenHash: string): Promise<ScimTokenRecord | null> {
    return Promise.resolve(
      [...this.records.values()].find((r) => r.tokenHash === tokenHash) ?? null,
    );
  }

  findByTenant(tenantId: string): Promise<ScimTokenRecord | null> {
    return Promise.resolve(this.records.get(tenantId) ?? null);
  }

  replace(
    tenantId: string,
    token: { tokenHash: string; prefix: string },
  ): Promise<ScimTokenRecord> {
    const previous = this.records.get(tenantId);
    const record: ScimTokenRecord = {
      id: previous?.id ?? randomUUID(),
      tenantId,
      ...token,
      createdAt: previous?.createdAt ?? new Date(),
      rotatedAt: previous ? new Date() : null,
      lastUsedAt: null,
    };

    this.records.set(tenantId, record);

    return Promise.resolve(record);
  }

  remove(tenantId: string): Promise<boolean> {
    return Promise.resolve(this.records.delete(tenantId));
  }

  touch(id: string, at: Date): Promise<void> {
    for (const record of this.records.values()) {
      if (record.id === id) {
        record.lastUsedAt = at;
      }
    }

    return Promise.resolve();
  }
}

export class InMemoryScimDirectory implements ScimDirectoryStore {
  readonly users = new Map<string, ScimUserRow>();
  readonly groups = new Map<string, ScimGroupRow>();

  listUsers(
    _tenantId: string,
    query: ScimListQuery,
  ): Promise<ScimPage<ScimUserRow>> {
    const matching = [...this.users.values()].filter((user) => {
      if (!query.filter) {
        return true;
      }

      return query.filter.attribute === 'username'
        ? user.email === query.filter.value.toLowerCase()
        : user.externalId === query.filter.value;
    });

    return Promise.resolve({
      rows: matching.slice(query.startIndex - 1, query.startIndex - 1 + query.count),
      total: matching.length,
    });
  }

  findUser(_tenantId: string, id: string): Promise<ScimUserRow | null> {
    return Promise.resolve(this.users.get(id) ?? null);
  }

  createUser(_tenantId: string, input: ScimUserInput): Promise<ScimUserRow> {
    if ([...this.users.values()].some((user) => user.email === input.email)) {
      return Promise.reject(ScimException.conflict('userName is already taken.'));
    }

    const now = new Date();
    const row: ScimUserRow = {
      id: randomUUID(),
      email: input.email,
      name: input.name,
      givenName: input.givenName,
      familyName: input.familyName,
      externalId: input.externalId,
      isActive: input.isActive,
      createdAt: now,
      updatedAt: now,
    };

    this.users.set(row.id, row);

    return Promise.resolve(row);
  }

  updateUser(
    _tenantId: string,
    id: string,
    input: ScimUserInput,
  ): Promise<ScimUserRow | null> {
    const current = this.users.get(id);

    if (!current) {
      return Promise.resolve(null);
    }

    const row: ScimUserRow = { ...current, ...input, updatedAt: new Date() };

    this.users.set(id, row);

    return Promise.resolve(row);
  }

  existingUserIds(_tenantId: string, ids: string[]): Promise<string[]> {
    return Promise.resolve(ids.filter((id) => this.users.has(id)));
  }

  listGroups(
    _tenantId: string,
    query: ScimListQuery,
  ): Promise<ScimPage<ScimGroupRow>> {
    const rows = [...this.groups.values()];

    return Promise.resolve({
      rows: rows.slice(query.startIndex - 1, query.startIndex - 1 + query.count),
      total: rows.length,
    });
  }

  findGroup(_tenantId: string, id: string): Promise<ScimGroupRow | null> {
    return Promise.resolve(this.groups.get(id) ?? null);
  }

  createGroup(_tenantId: string, input: ScimGroupInput): Promise<ScimGroupRow> {
    const now = new Date();
    const row: ScimGroupRow = {
      id: randomUUID(),
      name: input.name,
      externalId: input.externalId,
      members: this.membersOf(input.memberIds),
      createdAt: now,
      updatedAt: now,
    };

    this.groups.set(row.id, row);

    return Promise.resolve(row);
  }

  updateGroup(
    _tenantId: string,
    id: string,
    input: ScimGroupInput,
  ): Promise<ScimGroupRow | null> {
    const current = this.groups.get(id);

    if (!current) {
      return Promise.resolve(null);
    }

    const row: ScimGroupRow = {
      ...current,
      name: input.name,
      externalId: input.externalId,
      members: this.membersOf(input.memberIds),
      updatedAt: new Date(),
    };

    this.groups.set(id, row);

    return Promise.resolve(row);
  }

  deleteGroup(_tenantId: string, id: string): Promise<boolean> {
    return Promise.resolve(this.groups.delete(id));
  }

  private membersOf(ids: string[]) {
    return ids.flatMap((id) => {
      const user = this.users.get(id);

      return user ? [{ id, email: user.email }] : [];
    });
  }
}
