import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '#technical/auth/session.guard';
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { Capability } from '#technical/capabilities/capability.decorator';
import { ok } from '#technical/http/envelope';
import { okPage, parsePageQuery } from '#technical/http/page-query';
import { RateLimit } from '#technical/rate-limit/rate-limit.decorator';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { ZodValidationPipe } from '#technical/validation/zod-validation.pipe';
import { canManageAuditSinks } from './audit.policy';
import { AuditSinkService } from './audit-sink.service';
import {
  createAuditSinkSchema,
  updateAuditSinkSchema,
} from './audit-sink.schema';
import type {
  CreateAuditSinkInput,
  UpdateAuditSinkInput,
} from './audit-sink.schema';

@Controller('audit-sinks')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class AuditSinkController {
  constructor(private readonly sinks: AuditSinkService) {}

  @RateLimit('read')
  @Get()
  @Capability(canManageAuditSinks)
  async list(@Query() query: unknown) {
    const page = parsePageQuery(query);

    return okPage(
      await this.sinks.page(TenantContextStorage.getTenantId(), page),
      page,
    );
  }

  @RateLimit('write')
  @Post()
  @Capability(canManageAuditSinks)
  async create(
    @Body(new ZodValidationPipe(createAuditSinkSchema))
    body: CreateAuditSinkInput,
  ) {
    return ok(
      await this.sinks.create(TenantContextStorage.getTenantId(), body),
      ['Audit sink created.'],
    );
  }

  @RateLimit('write')
  @Patch(':id')
  @Capability(canManageAuditSinks)
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAuditSinkSchema))
    body: UpdateAuditSinkInput,
  ) {
    return ok(
      await this.sinks.update(TenantContextStorage.getTenantId(), id, body),
      ['Audit sink updated.'],
    );
  }

  @RateLimit('write')
  @Delete(':id')
  @Capability(canManageAuditSinks)
  async remove(@Param('id') id: string) {
    await this.sinks.remove(TenantContextStorage.getTenantId(), id);

    return ok(null, ['Audit sink deleted.']);
  }

  @RateLimit('write')
  @Post(':id/test')
  @HttpCode(200)
  @Capability(canManageAuditSinks)
  async test(@Param('id') id: string) {
    return ok(await this.sinks.probe(TenantContextStorage.getTenantId(), id));
  }

  @RateLimit('write')
  @Post(':id/stream')
  @HttpCode(200)
  @Capability(canManageAuditSinks)
  async stream(@Param('id') id: string) {
    const batches = await this.sinks.flush(
      TenantContextStorage.getTenantId(),
      id,
    );

    return ok({ batches }, ['New audit entries handed to the outbox.']);
  }
}
