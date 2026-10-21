import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { SessionGuard } from '#technical/auth/session.guard';
import { Capability } from '#technical/capabilities/capability.decorator';
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { RateLimit } from '#technical/rate-limit/rate-limit.decorator';
import { ok } from '#technical/http/envelope';
import { ZodValidationPipe } from '#technical/validation/zod-validation.pipe';
import {
  confirmUploadIntentSchema,
  createUploadIntentSchema,
} from './create-upload-intent.dto';
import type {
  ConfirmUploadIntentDto,
  CreateUploadIntentDto,
} from './create-upload-intent.dto';
import { canUploadFiles } from './storage-upload.policy';
import { StorageUploadIntentService } from './storage-upload-intent.service';

@Controller('storage/upload-intent')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class StorageUploadIntentController {
  constructor(private readonly intents: StorageUploadIntentService) {}

  @RateLimit('write')
  @Post()
  @Capability(canUploadFiles)
  async create(
    @Body(new ZodValidationPipe(createUploadIntentSchema))
    body: CreateUploadIntentDto,
  ) {
    const intent = await this.intents.create(body);

    return ok(intent, ['Upload intent created.']);
  }

  @RateLimit('write')
  @Post('confirm')
  @Capability(canUploadFiles)
  async confirm(
    @Body(new ZodValidationPipe(confirmUploadIntentSchema))
    body: ConfirmUploadIntentDto,
  ) {
    const stored = await this.intents.confirm(body.key);

    return ok(stored, ['Upload confirmed.']);
  }
}
