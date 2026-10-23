import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { type RequestWithUser, SessionGuard } from '#kernel/public/auth';
import { CapabilitiesGuard, Capability } from '#kernel/public/capabilities';
import {
  ok,
  okPage,
  parsePageQuery,
  RateLimit,
  ZodValidationPipe,
} from '#kernel/public/http';
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
