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
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { Capability } from '#technical/capabilities/capability.decorator';
import { ApiKeyEscalationException } from '#technical/errors/api-key-escalation.exception';
import { ok } from '#technical/http/envelope';
import { ZodValidationPipe } from '#technical/validation/zod-validation.pipe';
import { canManageOwnApiKeys } from './api-key.policy';
import { ApiKeyService } from './api-key.service';
import { createApiKeySchema } from './api-key.schemas';
import type { CreateApiKeyInput } from './api-key.schemas';
import { SessionGuard } from './session.guard';
import type { RequestWithUser } from './session.guard';

// Revoking a leaked key would not actually cut off access if the bearer could
// mint further keys with it -- each with its own prefix and revokedAt, so
// revoking one leaves the others live. Only a real session may manage keys.
function assertNotApiKey(req: RequestWithUser): void {
  if (req.credential === 'apiKey') {
    throw new ApiKeyEscalationException();
  }
}

@Controller('api-keys')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class ApiKeyController {
  constructor(private readonly apiKeys: ApiKeyService) {}

  @Post()
  @Capability(canManageOwnApiKeys)
  async create(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(createApiKeySchema)) body: CreateApiKeyInput,
  ) {
    assertNotApiKey(req);
    const created = await this.apiKeys.create(req.user, body.name);
    return ok(created, [
      'API key created. This is the only time the key is shown.',
    ]);
  }

  @Get()
  @Capability(canManageOwnApiKeys)
  async list(@Req() req: RequestWithUser) {
    assertNotApiKey(req);
    return ok(await this.apiKeys.list(req.user));
  }

  @Delete(':id')
  @Capability(canManageOwnApiKeys)
  async revoke(@Req() req: RequestWithUser, @Param('id') id: string) {
    assertNotApiKey(req);
    await this.apiKeys.revoke(req.user, id);
    return ok(null, ['API key revoked.']);
  }
}
