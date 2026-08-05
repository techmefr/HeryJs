import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { Capability } from '#technical/capabilities/capability.decorator';
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { ZodValidationPipe } from '#technical/validation/zod-validation.pipe';
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
  async receive(
    @Param('endpointId') endpointId: string,
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-webhook-signature') signature: string | undefined,
    @Headers('x-webhook-timestamp') timestamp: string | undefined,
  ) {
    const result = await this.webhooks.receive({
      endpointId,
      rawBody: req.rawBody ?? Buffer.alloc(0),
      signature,
      timestamp,
    });

    return ok(result);
  }
}
