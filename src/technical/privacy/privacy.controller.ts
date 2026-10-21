import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '#technical/auth/session.guard';
import type { RequestWithUser } from '#technical/auth/session.guard';
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { Capability } from '#technical/capabilities/capability.decorator';
import { ok } from '#technical/http/envelope';
import { okPage, parsePageQuery } from '#technical/http/page-query';
import { RateLimit } from '#technical/rate-limit/rate-limit.decorator';
import { ZodValidationPipe } from '#technical/validation/zod-validation.pipe';
import {
  eraseTenantRequestSchema,
  eraseUserRequestSchema,
  exportRequestSchema,
} from './privacy.dto';
import type {
  EraseTenantRequestInput,
  EraseUserRequestInput,
  ExportRequestInput,
} from './privacy.dto';
import { canEraseTenant, canRequestPrivacyAction } from './privacy.policy';
import { PrivacyService } from './privacy.service';

const ACCEPTED = 202;

/**
 * Every POST answers 202 with a request to poll: the work runs on the queue,
 * and the answer to "is it done" is `GET /privacy/requests/:id`.
 */
@Controller('privacy')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @RateLimit('write')
  @HttpCode(ACCEPTED)
  @Post('exports')
  @Capability(canRequestPrivacyAction)
  async requestExport(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(exportRequestSchema)) body: ExportRequestInput,
  ) {
    return ok(await this.privacy.requestExport(req.user, body.userId), [
      'Export requested.',
    ]);
  }

  @RateLimit('write')
  @HttpCode(ACCEPTED)
  @Post('erasures/user')
  @Capability(canRequestPrivacyAction)
  async requestUserErasure(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(eraseUserRequestSchema))
    body: EraseUserRequestInput,
  ) {
    return ok(await this.privacy.requestUserErasure(req.user, body.userId), [
      'Erasure requested.',
    ]);
  }

  @RateLimit('write')
  @HttpCode(ACCEPTED)
  @Post('erasures/tenant')
  @Capability(canEraseTenant)
  async requestTenantErasure(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(eraseTenantRequestSchema))
    body: EraseTenantRequestInput,
  ) {
    return ok(await this.privacy.requestTenantErasure(req.user, body.confirm), [
      'Erasure requested.',
    ]);
  }

  @RateLimit('read')
  @Get('requests')
  @Capability(canRequestPrivacyAction)
  async list(@Req() req: RequestWithUser, @Query() query: unknown) {
    const page = parsePageQuery(query);

    return okPage(await this.privacy.page(req.user, page), page);
  }

  @RateLimit('read')
  @Get('requests/:id')
  @Capability(canRequestPrivacyAction)
  async find(@Req() req: RequestWithUser, @Param('id') id: string) {
    return ok(await this.privacy.find(req.user, id));
  }
}
