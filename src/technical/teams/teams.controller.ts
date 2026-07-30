import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import type { RequestWithUser } from '../auth/session.guard';
import { CapabilityForbiddenException } from '../errors/capability-forbidden.exception';
import { ok } from '../http/envelope';
import { ZodValidationPipe } from '../validation/zod-validation.pipe';
import {
  addTeamMemberSchema,
  createTeamSchema,
  switchTeamSchema,
} from './teams.dto';
import type {
  AddTeamMemberInput,
  CreateTeamInput,
  SwitchTeamInput,
} from './teams.dto';
import { TeamsService } from './teams.service';

/**
 * Membership is a perimeter, so every route here reads it from the session
 * rather than from the request body. Roles and invitations are deliberately
 * absent: they are product decisions, not conventions.
 */
@Controller('teams')
@UseGuards(SessionGuard)
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  @Get()
  async list(@Req() req: RequestWithUser) {
    return ok(await this.teams.listFor(req.user.id), {
      currentTeamId: req.user.currentTeamId,
    });
  }

  @Post()
  async create(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(createTeamSchema)) body: CreateTeamInput,
  ) {
    return ok(await this.teams.create(req.user.id, body.name), [
      'Team created.',
    ]);
  }

  @Post(':id/members')
  async addMember(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addTeamMemberSchema)) body: AddTeamMemberInput,
  ) {
    // Without this, anyone could add themselves to any team and read every
    // record that team owns.
    this.assertMember(req, id);

    return ok(await this.teams.addMember(id, body.userId), ['Member added.']);
  }

  @Patch('current')
  async switchCurrent(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(switchTeamSchema)) body: SwitchTeamInput,
  ) {
    this.assertMember(req, body.teamId);

    return ok(await this.teams.switchTo(req.user.id, body.teamId), [
      'Current team changed.',
    ]);
  }

  private assertMember(req: RequestWithUser, teamId: string): void {
    if (!req.user.teamIds.includes(teamId)) {
      throw new CapabilityForbiddenException({ allowed: false });
    }
  }
}
