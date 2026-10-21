import {
  Controller,
  Get,
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
import { deliveryFilterSchema } from './outbound-webhook.dto';
import type { DeliveryFilter } from './outbound-webhook.dto';
import { WebhookDeliveryService } from './webhook-delivery.service';
import { canManageWebhooks } from './webhooks.policy';

const filterPipe = new ZodValidationPipe(deliveryFilterSchema);

@Controller('webhook-deliveries')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class WebhookDeliveryController {
  constructor(private readonly deliveries: WebhookDeliveryService) {}

  @RateLimit('read')
  @Get()
  @Capability(canManageWebhooks)
  async list(@Req() req: RequestWithUser, @Query() query: unknown) {
    const page = parsePageQuery(query);
    const filter = filterPipe.transform(query) as DeliveryFilter;

    return okPage(
      await this.deliveries.list(req.user.tenantId, filter, page),
      page,
    );
  }

  @RateLimit('read')
  @Get(':id')
  @Capability(canManageWebhooks)
  async get(@Req() req: RequestWithUser, @Param('id') id: string) {
    return ok(await this.deliveries.get(req.user.tenantId, id));
  }

  @RateLimit('write')
  @Post(':id/redeliver')
  @Capability(canManageWebhooks)
  async redeliver(@Req() req: RequestWithUser, @Param('id') id: string) {
    return ok(await this.deliveries.redeliver(req.user.tenantId, id), [
      'Delivery queued again.',
    ]);
  }
}
