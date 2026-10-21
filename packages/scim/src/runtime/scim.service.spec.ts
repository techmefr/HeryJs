import { ScimException } from './scim.exception';
import { SCIM_PATCH_SCHEMA } from './scim.types';
import { InMemoryScimDirectory, InMemoryScimTokenStore } from './scim.fakes';
import { parseScimFilter, parseScimListQuery } from './scim-filter';
import { ScimGroupsService } from './scim-groups.service';
import { listResponse, toUserResource } from './scim-resources';
import { ScimTokenService } from './scim-token.service';
import { ScimUsersService } from './scim-users.service';

const TENANT = 'acme';

function patch(...operations: Array<Record<string, unknown>>) {
  return { schemas: [SCIM_PATCH_SCHEMA], Operations: operations };
}

describe('SCIM users', () => {
  let directory: InMemoryScimDirectory;
  let users: ScimUsersService;

  beforeEach(() => {
    directory = new InMemoryScimDirectory();
    users = new ScimUsersService(directory);
  });

  const create = (userName = 'Jane@Acme.com') =>
    users.create(TENANT, {
      userName,
      externalId: 'ext-1',
      name: { givenName: 'Jane', familyName: 'Doe' },
      active: true,
    });

  it('creates a member with a lower-cased address and a composed name', async () => {
    const { row, action } = await create();

    expect(action).toBe('created');
    expect(row.email).toBe('jane@acme.com');
    expect(row.name).toBe('Jane Doe');
    expect(row.isActive).toBe(true);
  });

  it('refuses a userName that is not an email address', async () => {
    await expect(create('jane')).rejects.toBeInstanceOf(ScimException);
  });

  it('refuses a body without a userName', async () => {
    await expect(users.create(TENANT, { active: true })).rejects.toMatchObject({
      scimType: 'invalidValue',
    });
  });

  it('answers a duplicate address with a uniqueness conflict', async () => {
    await create();

    await expect(create()).rejects.toMatchObject({ scimType: 'uniqueness' });
  });

  it('deactivates and reactivates through PATCH, reading the string booleans some directories send', async () => {
    const { row } = await create();

    const off = await users.patch(
      TENANT,
      row.id,
      patch({ op: 'Replace', path: 'active', value: 'False' }),
    );

    expect(off.action).toBe('deactivated');
    expect(off.row.isActive).toBe(false);

    const on = await users.patch(
      TENANT,
      row.id,
      patch({ op: 'replace', value: { active: true } }),
    );

    expect(on.action).toBe('reactivated');
  });

  it('updates attributes through PATCH and through PUT', async () => {
    const { row } = await create();

    const patched = await users.patch(
      TENANT,
      row.id,
      patch({ op: 'replace', path: 'name.givenName', value: 'Janet' }),
    );

    expect(patched.row.givenName).toBe('Janet');
    expect(patched.action).toBe('updated');

    const replaced = await users.replace(TENANT, row.id, {
      userName: 'jane@acme.com',
      displayName: 'J. Doe',
    });

    expect(replaced.row.name).toBe('J. Doe');
  });

  it('deactivates on DELETE and never removes the member', async () => {
    const { row } = await create();
    const outcome = await users.deactivate(TENANT, row.id);

    expect(outcome.action).toBe('deactivated');
    expect(directory.users.has(row.id)).toBe(true);
  });

  it('answers an unknown id with a 404', async () => {
    await expect(users.get(TENANT, 'nope')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('refuses a PATCH without the PatchOp schema', async () => {
    const { row } = await create();

    await expect(
      users.patch(TENANT, row.id, { Operations: [{ op: 'replace' }] }),
    ).rejects.toBeInstanceOf(ScimException);
  });

  it('renders a SCIM resource and a list response', async () => {
    const { row } = await create();
    const resource = toUserResource(row, 'https://api.test');

    expect(resource.userName).toBe('jane@acme.com');
    expect(resource.meta.location).toBe(
      `https://api.test/scim/v2/Users/${row.id}`,
    );
    expect(listResponse([resource], 1, 1).totalResults).toBe(1);
  });
});

describe('SCIM groups', () => {
  let directory: InMemoryScimDirectory;
  let users: ScimUsersService;
  let groups: ScimGroupsService;

  beforeEach(() => {
    directory = new InMemoryScimDirectory();
    users = new ScimUsersService(directory);
    groups = new ScimGroupsService(directory);
  });

  it('creates a team whose members are the tenant users', async () => {
    const { row: member } = await users.create(TENANT, {
      userName: 'a@acme.com',
    });
    const { row } = await groups.create(TENANT, {
      displayName: 'Engineering',
      members: [{ value: member.id }],
    });

    expect(row.members).toHaveLength(1);
  });

  it('refuses a member that is not a user of the tenant', async () => {
    await expect(
      groups.create(TENANT, {
        displayName: 'X',
        members: [{ value: 'ghost' }],
      }),
    ).rejects.toMatchObject({ scimType: 'invalidValue' });
  });

  it('adds and removes members through PATCH', async () => {
    const { row: a } = await users.create(TENANT, { userName: 'a@acme.com' });
    const { row: b } = await users.create(TENANT, { userName: 'b@acme.com' });
    const { row: group } = await groups.create(TENANT, { displayName: 'Team' });

    const added = await groups.patch(
      TENANT,
      group.id,
      patch({
        op: 'add',
        path: 'members',
        value: [{ value: a.id }, { value: b.id }],
      }),
    );

    expect(added.row.members).toHaveLength(2);

    const removed = await groups.patch(
      TENANT,
      group.id,
      patch({ op: 'remove', path: `members[value eq "${a.id}"]` }),
    );

    expect(removed.row.members.map((m) => m.id)).toEqual([b.id]);
  });

  it('deletes the team', async () => {
    const { row } = await groups.create(TENANT, { displayName: 'Team' });

    expect((await groups.remove(TENANT, row.id)).action).toBe('deleted');
    await expect(groups.get(TENANT, row.id)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('SCIM filter', () => {
  it('accepts an eq filter on the supported attributes only', () => {
    expect(parseScimFilter('userName eq "a@b.co"', 'user')).toEqual({
      attribute: 'username',
      value: 'a@b.co',
    });
    expect(() => parseScimFilter('userName co "a"', 'user')).toThrow(
      ScimException,
    );
    expect(() => parseScimFilter('displayName eq "a"', 'user')).toThrow(
      ScimException,
    );
  });

  it('bounds the page', () => {
    expect(
      parseScimListQuery({ count: '5000', startIndex: '0' }, 'user'),
    ).toMatchObject({ startIndex: 1, count: 100 });
  });
});

describe('SCIM token', () => {
  let store: InMemoryScimTokenStore;
  let tokens: ScimTokenService;

  beforeEach(() => {
    store = new InMemoryScimTokenStore();
    tokens = new ScimTokenService(store);
  });

  it('authenticates the tenant that holds the token and stores only a hash', async () => {
    const { token } = await tokens.issue(TENANT);

    expect([...store.records.values()][0]?.tokenHash).not.toContain(token);
    expect(await tokens.authenticate(`Bearer ${token}`)).toMatchObject({
      tenantId: TENANT,
    });
  });

  it('stops honouring the previous token once a new one is issued', async () => {
    const first = await tokens.issue(TENANT);
    const second = await tokens.issue(TENANT);

    expect(await tokens.authenticate(`Bearer ${first.token}`)).toBeNull();
    expect(await tokens.authenticate(`Bearer ${second.token}`)).not.toBeNull();
    expect(second.status.rotatedAt).not.toBeNull();
  });

  it('refuses a missing, malformed or revoked token', async () => {
    const { token } = await tokens.issue(TENANT);

    expect(await tokens.authenticate(undefined)).toBeNull();
    expect(await tokens.authenticate('Basic abc')).toBeNull();
    expect(await tokens.authenticate('Bearer wrong')).toBeNull();

    await tokens.revoke(TENANT);

    expect(await tokens.authenticate(`Bearer ${token}`)).toBeNull();
  });

  it('records when the token was last used', async () => {
    const { token } = await tokens.issue(TENANT);

    await tokens.authenticate(`Bearer ${token}`);

    expect((await tokens.status(TENANT)).lastUsedAt).not.toBeNull();
  });
});
