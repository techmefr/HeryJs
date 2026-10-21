import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '#app.module';
import { env } from '#technical/config/env';
import { RecordNotFoundException } from '#technical/errors/record-not-found.exception';
import { runInTenant } from '#technical/tenancy/run-in-tenant';
import { SharingModule } from './sharing.module';
import { SharingService } from './sharing.service';

describe('SharingService (real database)', () => {
  const rawClient = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
  });
  const tenantA = `tenant-share-a-${randomUUID()}`;
  const tenantB = `tenant-share-b-${randomUUID()}`;
  const resource = 'BlogPost';
  let service: SharingService;
  let moduleClose: () => Promise<void>;
  let owner: string;
  let grantee: string;
  let outsider: string;
  let team: string;

  const subjectOf = (id: string, teamIds: string[] = []) => ({
    id,
    teamIds,
    currentTeamId: null,
    role: null,
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, SharingModule],
    }).compile();
    await moduleRef.init();
    service = moduleRef.get(SharingService);
    moduleClose = () => moduleRef.close();

    const make = async (tenantId: string) =>
      (
        await rawClient.user.create({
          data: { email: `share-${randomUUID()}@example.test`, tenantId },
        })
      ).id;

    owner = await make(tenantA);
    grantee = await make(tenantA);
    outsider = await make(tenantB);
    team = (
      await rawClient.team.create({
        data: { name: 'Sharing', tenantId: tenantA },
      })
    ).id;
  });

  afterAll(async () => {
    await rawClient.recordShare.deleteMany({
      where: { tenantId: { in: [tenantA, tenantB] } },
    });
    await rawClient.auditLog.deleteMany({
      where: { tenantId: { in: [tenantA, tenantB] } },
    });
    await rawClient.team.deleteMany({ where: { tenantId: tenantA } });
    await rawClient.user.deleteMany({
      where: { id: { in: [owner, grantee, outsider] } },
    });
    await rawClient.$disconnect();
    await moduleClose();
  });

  const inA = <T>(work: () => Promise<T>) =>
    runInTenant(tenantA, work, { userId: owner });

  it('folds the ids shared with a user into one lookup, directly and through a team', async () => {
    const direct = `rec-${randomUUID()}`;
    const viaTeam = `rec-${randomUUID()}`;

    await inA(async () => {
      await service.grant(resource, direct, owner, {
        granteeType: 'user',
        granteeId: grantee,
        access: 'read',
      });
      await service.grant(resource, viaTeam, owner, {
        granteeType: 'team',
        granteeId: team,
        access: 'write',
      });
    });

    const ids = await inA(() =>
      service.sharedRecordIds(resource, subjectOf(grantee, [team])),
    );

    expect(ids).toEqual(expect.arrayContaining([direct, viaTeam]));
    expect(
      await inA(() => service.sharedRecordIds(resource, subjectOf(grantee))),
    ).toEqual([direct]);
    expect(
      await inA(() => service.sharedRecordIds('Other', subjectOf(grantee))),
    ).toEqual([]);
  });

  it('attaches the shares of a whole page in one go', async () => {
    const first = `rec-${randomUUID()}`;
    const second = `rec-${randomUUID()}`;

    await inA(() =>
      service.grant(resource, first, owner, {
        granteeType: 'user',
        granteeId: grantee,
        access: 'read',
      }),
    );

    const page = await inA(() =>
      service.withShares(resource, [{ id: first }, { id: second }]),
    );

    expect(page[0]!.shares).toEqual([
      { granteeType: 'user', granteeId: grantee, access: 'read' },
    ]);
    expect(page[1]!.shares).toEqual([]);
  });

  it('changes the access on a second grant instead of adding a row', async () => {
    const recordId = `rec-${randomUUID()}`;
    const input = { granteeType: 'user', granteeId: grantee } as const;

    await inA(() =>
      service.grant(resource, recordId, owner, { ...input, access: 'read' }),
    );
    await inA(() =>
      service.grant(resource, recordId, owner, { ...input, access: 'write' }),
    );

    const shares = await inA(() => service.list(resource, recordId));

    expect(shares).toHaveLength(1);
    expect(shares[0]!.access).toBe('write');
  });

  it("revokes one share, and not another record's share with the same id", async () => {
    const recordId = `rec-${randomUUID()}`;
    const other = `rec-${randomUUID()}`;
    const share = await inA(() =>
      service.grant(resource, recordId, owner, {
        granteeType: 'user',
        granteeId: grantee,
        access: 'read',
      }),
    );

    await expect(
      inA(() => service.revoke(resource, other, share.id)),
    ).rejects.toBeInstanceOf(RecordNotFoundException);

    await inA(() => service.revoke(resource, recordId, share.id));

    expect(await inA(() => service.list(resource, recordId))).toEqual([]);
    await expect(
      inA(() => service.revoke(resource, recordId, share.id)),
    ).rejects.toBeInstanceOf(RecordNotFoundException);
  });

  it('refuses a grantee that lives in another tenant', async () => {
    await expect(
      inA(() =>
        service.grant(resource, 'rec-x', owner, {
          granteeType: 'user',
          granteeId: outsider,
          access: 'read',
        }),
      ),
    ).rejects.toBeInstanceOf(RecordNotFoundException);

    await expect(
      runInTenant(tenantB, () =>
        service.grant(resource, 'rec-x', outsider, {
          granteeType: 'team',
          granteeId: team,
          access: 'read',
        }),
      ),
    ).rejects.toBeInstanceOf(RecordNotFoundException);
  });

  it('never shows, matches or revokes a share across tenants', async () => {
    const recordId = `rec-${randomUUID()}`;
    const share = await inA(() =>
      service.grant(resource, recordId, owner, {
        granteeType: 'user',
        granteeId: grantee,
        access: 'write',
      }),
    );

    const inB = <T>(work: () => Promise<T>) => runInTenant(tenantB, work);

    expect(await inB(() => service.list(resource, recordId))).toEqual([]);
    expect(
      await inB(() => service.sharedRecordIds(resource, subjectOf(grantee))),
    ).toEqual([]);
    await expect(
      inB(() => service.revoke(resource, recordId, share.id)),
    ).rejects.toBeInstanceOf(RecordNotFoundException);
    expect(await inA(() => service.list(resource, recordId))).toHaveLength(1);
  });

  it('audits every grant and revoke with the acting user', async () => {
    const recordId = `rec-${randomUUID()}`;
    const share = await inA(() =>
      service.grant(resource, recordId, owner, {
        granteeType: 'user',
        granteeId: grantee,
        access: 'read',
      }),
    );
    await inA(() => service.revoke(resource, recordId, share.id));

    const entries = await rawClient.auditLog.findMany({
      where: { tenantId: tenantA, model: 'RecordShare', recordId: share.id },
      orderBy: { sequence: 'asc' },
    });

    expect(entries.map((entry) => entry.operation)).toEqual([
      'create',
      'delete',
    ]);
    expect(entries.every((entry) => entry.userId === owner)).toBe(true);
  });
});
