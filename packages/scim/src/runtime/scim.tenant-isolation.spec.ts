import { randomUUID } from 'node:crypto';
import { authPrismaClient } from '#kernel/public/auth';
import { createTenantScopedPrismaClient } from '#kernel/public/testing';
import { PrismaScimDirectoryStore } from './prisma-scim-directory.store';
import { ScimException } from './scim.exception';
import { SCIM_PATCH_SCHEMA } from './scim.types';
import { parseScimListQuery } from './scim-filter';
import { ScimGroupsService } from './scim-groups.service';
import { ScimUsersService } from './scim-users.service';

describe('tenant isolation', () => {
  const tenantA = `tenant-${randomUUID()}`;
  const tenantB = `tenant-${randomUUID()}`;
  const directory = new PrismaScimDirectoryStore(
    createTenantScopedPrismaClient(),
  );
  const users = new ScimUsersService(directory);
  const groups = new ScimGroupsService(directory);
  const allUsers = parseScimListQuery({}, 'user');
  const allGroups = parseScimListQuery({}, 'group');
  let userOfB: string;
  let groupOfB: string;

  const createUser = (tenantId: string) =>
    users.create(tenantId, {
      userName: `${randomUUID()}@isolation.test`,
      name: { givenName: 'Jane', familyName: 'Doe' },
      active: true,
    });

  beforeAll(async () => {
    await createUser(tenantA);
    userOfB = (await createUser(tenantB)).row.id;
    groupOfB = (
      await groups.create(tenantB, {
        displayName: 'Team B',
        members: [{ value: userOfB }],
      })
    ).row.id;
  });

  afterAll(async () => {
    const tenantId = { in: [tenantA, tenantB] };

    await authPrismaClient.scimIdentity.deleteMany({ where: { tenantId } });
    await authPrismaClient.teamMember.deleteMany({ where: { tenantId } });
    await authPrismaClient.team.deleteMany({ where: { tenantId } });
    await authPrismaClient.user.deleteMany({ where: { tenantId } });
  });

  it('lists only the users and groups of the calling tenant', async () => {
    const listedUsers = await users.list(tenantA, allUsers);
    const listedGroups = await groups.list(tenantA, allGroups);

    expect(listedUsers.total).toBe(1);
    expect(listedUsers.rows.map((row) => row.id)).not.toContain(userOfB);
    expect(listedGroups.total).toBe(0);
  });

  it('does not let a tenant read a user or group of another tenant', async () => {
    await expect(users.get(tenantA, userOfB)).rejects.toBeInstanceOf(
      ScimException,
    );
    await expect(groups.get(tenantA, groupOfB)).rejects.toBeInstanceOf(
      ScimException,
    );
  });

  it('does not let a tenant change a user of another tenant', async () => {
    await expect(
      users.patch(tenantA, userOfB, {
        schemas: [SCIM_PATCH_SCHEMA],
        Operations: [{ op: 'replace', path: 'active', value: false }],
      }),
    ).rejects.toBeInstanceOf(ScimException);
    await expect(users.deactivate(tenantA, userOfB)).rejects.toBeInstanceOf(
      ScimException,
    );

    expect((await users.get(tenantB, userOfB)).isActive).toBe(true);
  });

  it('does not let a tenant rename, empty or delete a group of another tenant', async () => {
    await expect(
      groups.replace(tenantA, groupOfB, { displayName: 'Hijacked' }),
    ).rejects.toBeInstanceOf(ScimException);
    await expect(groups.remove(tenantA, groupOfB)).rejects.toBeInstanceOf(
      ScimException,
    );

    const untouched = await groups.get(tenantB, groupOfB);

    expect(untouched.name).toBe('Team B');
    expect(untouched.members.map((member) => member.id)).toEqual([userOfB]);
  });

  it('does not let a tenant enrol a user of another tenant in its own group', async () => {
    await expect(
      groups.create(tenantA, {
        displayName: 'Team A',
        members: [{ value: userOfB }],
      }),
    ).rejects.toBeInstanceOf(ScimException);
  });
});
