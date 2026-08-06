import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import {
  ExposeAction,
  ExposeField,
} from '#technical/exposition/exposition.decorators';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { canSeedAgency } from './agency.policy';

export interface AgencySeedResult {
  team: string;
  createdUserIds: string[];
}

/**
 * The exposition system's second worked example, next to prune: a seeder
 * declared entirely through @ExposeAction/@ExposeField rather than the
 * unused Seeder interface, so the mine, the CLI and this one method stay the
 * single source of truth for what the operation accepts.
 */
@Injectable()
export class AgencySeeder {
  @ExposeAction('agency.seed', {
    capability: canSeedAgency,
    environments: ['development', 'test'],
  })
  async run(
    @ExposeField('agency.seed.agency', {
      kind: 'string',
      maxLength: 100,
      default: 'Demo agency',
    })
    agency: string,
    @ExposeField('agency.seed.count', {
      kind: 'number',
      min: 1,
      max: 500,
      default: 10,
    })
    count: number,
  ): Promise<AgencySeedResult> {
    const tenantId = TenantContextStorage.getTenantId();

    const team =
      (await authPrismaClient.team.findFirst({
        where: { tenantId, name: agency },
      })) ??
      (await authPrismaClient.team.create({
        data: { tenantId, name: agency },
      }));

    const createdUserIds: string[] = [];

    for (let index = 0; index < count; index += 1) {
      const user = await authPrismaClient.user.create({
        data: { tenantId, email: `${randomUUID()}@agency-seed.test` },
      });
      await authPrismaClient.teamMember.create({
        data: { tenantId, teamId: team.id, userId: user.id },
      });
      createdUserIds.push(user.id);
    }

    return { team: team.name, createdUserIds };
  }
}
