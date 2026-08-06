import {
  Controller,
  Delete,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Capability } from '#kernel/capabilities/capability.decorator';
import { CapabilitiesGuard } from '#kernel/capabilities/capabilities.guard';
import { MissingSessionException } from '#kernel/errors/invalid-session.exception';
import { ok } from '#kernel/http/envelope';
import { SessionGuard } from '#kernel/auth/session.guard';
import type { RequestWithUser } from '#kernel/auth/session.guard';
import { canImpersonate, canStopImpersonation } from './impersonation.policy';
import { ImpersonationService } from './impersonation.service';

// SessionGuard already validated this exact header to build req.user, so
// this can only fail if that guard did not run -- which @UseGuards below
// rules out. Extracting it again rather than threading it through the guard
// keeps SessionGuard's contract (it returns a user, not a token) unchanged.
function bearerToken(req: RequestWithUser): string {
  const header = req.header('authorization');
  const token = header?.startsWith('Bearer ')
    ? header.slice('Bearer '.length)
    : undefined;

  if (!token) {
    throw new MissingSessionException();
  }

  return token;
}

@Controller('impersonation')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class ImpersonationController {
  constructor(private readonly impersonation: ImpersonationService) {}

  @Post(':userId')
  @Capability(canImpersonate)
  async start(@Req() req: RequestWithUser, @Param('userId') userId: string) {
    const session = await this.impersonation.start(
      req.user,
      bearerToken(req),
      userId,
    );

    return ok(session, ['Impersonation session created.']);
  }

  @Delete()
  @Capability(canStopImpersonation)
  async stop(@Req() req: RequestWithUser) {
    await this.impersonation.stop(req.user, bearerToken(req));

    return ok(null, ['Impersonation ended.']);
  }
}
