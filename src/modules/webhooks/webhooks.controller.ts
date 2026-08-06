import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { Capability } from '#technical/capabilities/capability.decorator';
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { PublicRoute } from '#technical/capabilities/public-route.decorator';
import { ZodValidationPipe } from '#technical/validation/zod-validation.pipe';
import { WebhookSignatureGuard } from './webhook-signature.guard';
import type { RequestWithWebhookEndpoint } from './webhook-signature.guard';
import { ok } from '#technical/http/envelope';
import { SessionGuard } from '#technical/auth/session.guard';
import type { RequestWithUser } from '#technical/auth/session.guard';
import { canManageWebhooks } from './webhooks.policy';
import { WebhooksService } from './webhooks.service';

const createEndpointSchema = z.object({
  source: z.string().min(1).max(100),
});

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Post('endpoints')
  @UseGuards(SessionGuard, CapabilitiesGuard)
  @Capability(canManageWebhooks)
  async createEndpoint(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(createEndpointSchema))
    body: { source: string },
  ) {
    const endpoint = await this.webhooks.createEndpoint(
      req.user.tenantId,
      body.source,
    );

    return ok(endpoint, ['Webhook endpoint created.']);
  }

  @Post(':endpointId')
  @HttpCode(202)
  @UseGuards(WebhookSignatureGuard)
  @PublicRoute(
    'inbound webhook: the sender has no session, it signs the raw body with the endpoint secret',
  )
  async receive(@Req() req: RequestWithWebhookEndpoint) {
    const result = await this.webhooks.receive({
      endpoint: req.webhookEndpoint,
      rawBody: req.rawBody ?? Buffer.alloc(0),
    });

    return ok(result);
  }
}
