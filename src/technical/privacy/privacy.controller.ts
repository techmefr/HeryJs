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
import { AdminAction, AdminSection } from '#technical/admin/admin-metadata';
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
  @AdminAction({
    id: 'privacy-export',
    title: 'Export data',
    icon: 'archive',
    section: 'privacy-requests',
    scope: 'global',
    fields: [
      {
        name: 'userId',
        label: 'User id (empty for the whole tenant)',
        type: 'text',
      },
    ],
  })
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
  @AdminAction({
    id: 'privacy-erase-user',
    title: 'Erase a user',
    icon: 'shield',
    section: 'privacy-requests',
    scope: 'global',
    confirm: 'Erase this user and their personal data. This cannot be undone.',
    danger: true,
    fields: [
      { name: 'userId', label: 'User id', type: 'text', required: true },
    ],
  })
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
  @AdminAction({
    id: 'privacy-erase-tenant',
    title: 'Erase the tenant',
    icon: 'shield',
    section: 'privacy-requests',
    scope: 'global',
    confirm:
      'Erase the personal data of the whole tenant. This cannot be undone.',
    danger: true,
    fields: [
      {
        name: 'confirm',
        label: 'Type the tenant id to confirm',
        type: 'text',
        required: true,
      },
    ],
  })
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
  @AdminSection({
    id: 'privacy-requests',
    title: 'Privacy requests',
    icon: 'shield',
    group: 'Compliance',
    columns: [
      { key: 'kind', label: 'Kind', format: 'badge' },
      { key: 'status', label: 'Status', format: 'badge' },
      { key: 'subjectId', label: 'Subject' },
      { key: 'createdAt', label: 'Requested', format: 'date' },
      { key: 'completedAt', label: 'Completed', format: 'date' },
      { key: 'error', label: 'Error' },
    ],
  })
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
