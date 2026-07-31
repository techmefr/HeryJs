import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ok } from '#technical/http/envelope';
import { ZodValidationPipe } from '#technical/validation/zod-validation.pipe';
import { ApiKeyService } from './api-key.service';
import { createApiKeySchema } from './api-key.schemas';
import type { CreateApiKeyInput } from './api-key.schemas';
import { SessionGuard } from './session.guard';
import type { RequestWithUser } from './session.guard';

@Controller('api-keys')
@UseGuards(SessionGuard)
export class ApiKeyController {
  constructor(private readonly apiKeys: ApiKeyService) {}

  @Post()
  async create(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(createApiKeySchema)) body: CreateApiKeyInput,
  ) {
    const created = await this.apiKeys.create(req.user, body.name);
    return ok(created, [
      'API key created. This is the only time the key is shown.',
    ]);
  }

  @Get()
  async list(@Req() req: RequestWithUser) {
    return ok(await this.apiKeys.list(req.user));
  }

  @Delete(':id')
  async revoke(@Req() req: RequestWithUser, @Param('id') id: string) {
    await this.apiKeys.revoke(req.user, id);
    return ok(null, ['API key revoked.']);
  }
}
