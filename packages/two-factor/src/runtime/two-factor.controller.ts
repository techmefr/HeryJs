import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CapabilitiesGuard, Capability } from '#kernel/public/capabilities';
import {
  ok,
  RateLimit,
  UnpaginatedRoute,
  ZodValidationPipe,
} from '#kernel/public/http';
import { type RequestWithUser, SessionGuard } from '#kernel/public/auth';
import { bearerToken } from './bearer-token';
import { canManageOwnTwoFactor } from './two-factor.policy';
import { codeSchema, verifySchema } from './two-factor.schemas';
import type { CodeInput, VerifyInput } from './two-factor.schemas';
import { TwoFactorService } from './two-factor.service';

@Controller('two-factor')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class TwoFactorController {
  constructor(private readonly twoFactor: TwoFactorService) {}

  @RateLimit('read')
  @UnpaginatedRoute('one object: the caller own second-factor state')
  @Get()
  @Capability(canManageOwnTwoFactor)
  async status(@Req() req: RequestWithUser) {
    return ok(await this.twoFactor.status(req.user, bearerToken(req)));
  }

  @RateLimit('write')
  @Post('enrolment')
  @Capability(canManageOwnTwoFactor)
  async beginEnrolment(@Req() req: RequestWithUser) {
    return ok(await this.twoFactor.beginEnrolment(req.user), [
      'Scan the code, then confirm it with a first code to finish enrolling.',
    ]);
  }

  @RateLimit('auth')
  @Post('enrolment/confirm')
  @HttpCode(200)
  @Capability(canManageOwnTwoFactor)
  async confirmEnrolment(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(codeSchema)) body: CodeInput,
  ) {
    const recoveryCodes = await this.twoFactor.confirmEnrolment(
      req.user,
      bearerToken(req),
      body.code,
    );

    return ok({ recoveryCodes }, [
      'Two-factor authentication is on. The recovery codes are shown only once.',
    ]);
  }

  @RateLimit('auth')
  @Post('verify')
  @HttpCode(200)
  @Capability(canManageOwnTwoFactor)
  async verify(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(verifySchema)) body: VerifyInput,
  ) {
    await this.twoFactor.verify(req.user, bearerToken(req), body);

    return ok(null, ['Second factor verified for this session.']);
  }

  @RateLimit('auth')
  @Post('recovery-codes')
  @HttpCode(200)
  @Capability(canManageOwnTwoFactor)
  async regenerateRecoveryCodes(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(codeSchema)) body: CodeInput,
  ) {
    const recoveryCodes = await this.twoFactor.regenerateRecoveryCodes(
      req.user,
      body.code,
    );

    return ok({ recoveryCodes }, [
      'The previous recovery codes no longer work. These are shown only once.',
    ]);
  }

  @RateLimit('auth')
  @Post('disable')
  @HttpCode(200)
  @Capability(canManageOwnTwoFactor)
  async disable(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(codeSchema)) body: CodeInput,
  ) {
    await this.twoFactor.disable(req.user, body.code);

    return ok(null, ['Two-factor authentication is off.']);
  }
}
