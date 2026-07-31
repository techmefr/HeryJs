import { Inject, Injectable } from '@nestjs/common';
import { RecordNotFoundException } from '#technical/errors/record-not-found.exception';
import { PRISMA_CLIENT } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';

@Injectable()
export class TeamsService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  listFor(userId: string) {
    return this.prisma.team.findMany({
      where: { members: { some: { userId } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * The creator joins the team it just created, otherwise it would own a
   * perimeter it is not inside and every team-scoped read would still deny it.
   */
  async create(userId: string, name: string) {
    const team = await this.prisma.team.create({ data: { name } });
    await this.prisma.teamMember.create({ data: { teamId: team.id, userId } });

    return team;
  }

  async addMember(teamId: string, memberId: string) {
    // The tenant-scoping extension filters this lookup, so a team belonging to
    // another tenant is simply not found rather than joinable.
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });

    if (!team) {
      throw new RecordNotFoundException('team');
    }

    // The tenant boundary already makes a cross-tenant membership grant
    // nothing, but it would still leave a row claiming a perimeter that cannot
    // exist, so it is refused outright rather than left inert.
    const member = await this.prisma.user.findUnique({
      where: { id: memberId },
      select: { tenantId: true },
    });

    if (!member || member.tenantId !== team.tenantId) {
      throw new RecordNotFoundException('user');
    }

    return this.prisma.teamMember.upsert({
      where: { teamId_userId: { teamId, userId: memberId } },
      create: { teamId, userId: memberId },
      update: {},
    });
  }

  switchTo(userId: string, teamId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { currentTeamId: teamId },
      select: { id: true, currentTeamId: true },
    });
  }

  async isMember(teamId: string, userId: string): Promise<boolean> {
    const membership = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
    });

    return membership !== null;
  }
}
