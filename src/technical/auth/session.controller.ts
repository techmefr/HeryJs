import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { Capability } from '#technical/capabilities/capability.decorator';
import { ApiKeySessionManagementException } from '#technical/errors/api-key-session-management.exception';
import { ok } from '#technical/http/envelope';
import { okPage, parsePageQuery } from '#technical/http/page-query';
import { RateLimit } from '#technical/rate-limit/rate-limit.decorator';
import { ZodValidationPipe } from '#technical/validation/zod-validation.pipe';
import { AUTH_BUCKET } from '#technical/rate-limit/rate-limit.config';
import { changePasswordSchema } from './auth.schemas';
import type { ChangePasswordInput } from './auth.schemas';
import { PasswordService } from './password.service';
import { canManageOwnSessions } from './session.policy';
import { rawSessionToken, SessionService } from './session.service';
import { SessionGuard } from './session.guard';
import type { RequestWithUser } from './session.guard';

const BEARER_PREFIX = 'Bearer ';

function sessionBearer(req: RequestWithUser): string {
  if (req.credential === 'apiKey') {
    throw new ApiKeySessionManagementException();
  }

  return (req.header('authorization') ?? '').slice(BEARER_PREFIX.length);
}

@Controller('auth')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class SessionController {
  constructor(
    private readonly sessions: SessionService,
    private readonly passwords: PasswordService,
  ) {}

  @RateLimit('read')
  @Get('sessions')
  @Capability(canManageOwnSessions)
  async list(@Req() req: RequestWithUser, @Query() query: unknown) {
    const bearer = sessionBearer(req);
    const page = parsePageQuery(query);

    return okPage(
      await this.sessions.list(req.user, rawSessionToken(bearer), page),
      page,
    );
  }

  @RateLimit('write')
  @Delete('sessions/others')
  @Capability(canManageOwnSessions)
  async revokeOthers(@Req() req: RequestWithUser) {
    const bearer = sessionBearer(req);
    const revoked = await this.sessions.revokeOthers(
      req.user,
      rawSessionToken(bearer),
    );

    return ok({ revoked }, ['Every other session was signed out.']);
  }

  @RateLimit('write')
  @Delete('sessions')
  @Capability(canManageOwnSessions)
  async revokeAll(@Req() req: RequestWithUser) {
    sessionBearer(req);
    const revoked = await this.sessions.revokeAll(req.user);

    return ok({ revoked }, ['Signed out everywhere.']);
  }

  @RateLimit('write')
  @Delete('sessions/:id')
  @Capability(canManageOwnSessions)
  async revoke(@Req() req: RequestWithUser, @Param('id') id: string) {
    sessionBearer(req);
    await this.sessions.revoke(req.user, id);

    return ok(null, ['Session signed out.']);
  }

  @RateLimit(AUTH_BUCKET)
  @Post('password/change')
  @Capability(canManageOwnSessions)
  async changePassword(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(changePasswordSchema))
    body: ChangePasswordInput,
  ) {
    const bearer = sessionBearer(req);
    const result = await this.passwords.change(
      bearer,
      body.currentPassword,
      body.newPassword,
    );

    return ok(result, [
      'Password changed. Every other session was signed out; use the new token.',
    ]);
  }
}
