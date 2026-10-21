import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '#kernel/auth/session.guard';
import type { RequestWithUser } from '#kernel/auth/session.guard';
import { CapabilitiesGuard } from '#kernel/capabilities/capabilities.guard';
import { Capability } from '#kernel/capabilities/capability.decorator';
import { ok } from '#kernel/http/envelope';
import { UnpaginatedRoute } from '#kernel/http/unpaginated-route.decorator';
import { RateLimit } from '#kernel/rate-limit/rate-limit.decorator';
import { ZodValidationPipe } from '#kernel/validation/zod-validation.pipe';
import {
  createSubscriptionSchema,
  rotateSecretSchema,
  updateSubscriptionSchema,
} from './outbound-webhook.dto';
import type {
  CreateSubscriptionInput,
  RotateSecretInput,
  UpdateSubscriptionInput,
} from './outbound-webhook.dto';
import { WebhookSubscriptionService } from './webhook-subscription.service';
import { canManageWebhooks } from './webhooks.policy';

@Controller('webhook-subscriptions')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class WebhookSubscriptionController {
  constructor(private readonly subscriptions: WebhookSubscriptionService) {}

  @UnpaginatedRoute(
    'a tenant holds a handful of subscriptions, capped at creation',
  )
  @RateLimit('read')
  @Get()
  @Capability(canManageWebhooks)
  async list(@Req() req: RequestWithUser) {
    return ok(await this.subscriptions.list(req.user.tenantId));
  }

  @RateLimit('read')
  @Get(':id')
  @Capability(canManageWebhooks)
  async get(@Req() req: RequestWithUser, @Param('id') id: string) {
    return ok(await this.subscriptions.get(req.user.tenantId, id));
  }

  @RateLimit('write')
  @Post()
  @Capability(canManageWebhooks)
  async create(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(createSubscriptionSchema))
    body: CreateSubscriptionInput,
  ) {
    return ok(await this.subscriptions.create(req.user.tenantId, body), [
      'Webhook subscription created. The secret is shown once.',
    ]);
  }

  @RateLimit('write')
  @Patch(':id')
  @Capability(canManageWebhooks)
  async update(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSubscriptionSchema))
    body: UpdateSubscriptionInput,
  ) {
    return ok(await this.subscriptions.update(req.user.tenantId, id, body), [
      'Webhook subscription updated.',
    ]);
  }

  @RateLimit('write')
  @Delete(':id')
  @Capability(canManageWebhooks)
  async remove(@Req() req: RequestWithUser, @Param('id') id: string) {
    await this.subscriptions.remove(req.user.tenantId, id);

    return ok(null, ['Webhook subscription deleted.']);
  }

  @RateLimit('write')
  @Post(':id/rotate-secret')
  @Capability(canManageWebhooks)
  async rotateSecret(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(rotateSecretSchema)) body: RotateSecretInput,
  ) {
    return ok(await this.subscriptions.rotate(req.user.tenantId, id, body), [
      'Secret rotated. The new secret is shown once.',
    ]);
  }
}
