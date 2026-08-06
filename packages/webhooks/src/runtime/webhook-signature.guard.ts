import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { authPrismaClient } from '#kernel/auth/better-auth.instance';
import { env } from '#kernel/config/env';
import { TraceContextStorage } from '#kernel/tracing/trace-context';
import { InvalidWebhookSignatureException } from './invalid-webhook-signature.exception';
import { verifyWebhookSignature } from './webhook-signature';

export interface VerifiedWebhookEndpoint {
  id: string;
  tenantId: string;
  source: string;
}

export type RequestWithWebhookEndpoint = RawBodyRequest<Request> & {
  webhookEndpoint: VerifiedWebhookEndpoint;
};

/**
 * An inbound webhook has no session and no capability to resolve: the sender is
 * a third-party service, and its credential is the HMAC signature over the raw
 * body. Checking it in a guard is what puts this route on the same footing as
 * every other one -- gated before the handler, and visible as a gate in the
 * pipeline trace -- instead of leaving the check buried in the service.
 */
@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const start = process.hrtime.bigint();
    const request = context
      .switchToHttp()
      .getRequest<RequestWithWebhookEndpoint>();

    // Rejecting an unknown endpoint id, an inactive endpoint and a bad
    // signature with the exact same exception keeps them indistinguishable from
    // the outside -- a probe for real endpoint ids gets nothing back that a
    // probe for real signatures wouldn't also get. The reason goes to the
    // trace, which only a developer of this app can read.
    const rejection = (reason: string) => {
      TraceContextStorage.pushStep({
        stage: 'guard',
        label: 'webhook signature',
        status: 'blocked',
        durationMs: Number(process.hrtime.bigint() - start) / 1_000_000,
        detail: { reason },
      });

      return new InvalidWebhookSignatureException();
    };

    const signature = request.header('x-webhook-signature');
    const timestamp = request.header('x-webhook-timestamp');

    if (!signature || !timestamp) {
      throw rejection('missing signature or timestamp header');
    }

    const endpoint = await authPrismaClient.webhookEndpoint.findUnique({
      where: { id: String(request.params.endpointId ?? '') },
    });

    if (!endpoint || !endpoint.active) {
      throw rejection('unknown or inactive endpoint');
    }

    const valid = verifyWebhookSignature({
      secret: endpoint.secret,
      timestamp,
      rawBody: request.rawBody ?? Buffer.alloc(0),
      signature,
      toleranceSeconds: env.WEBHOOK_SIGNATURE_TOLERANCE_SECONDS,
    });

    if (!valid) {
      throw rejection(
        'signature does not match, or timestamp is outside the tolerance window',
      );
    }

    request.webhookEndpoint = {
      id: endpoint.id,
      tenantId: endpoint.tenantId,
      source: endpoint.source,
    };

    TraceContextStorage.pushStep({
      stage: 'guard',
      label: 'webhook signature',
      status: 'ok',
      durationMs: Number(process.hrtime.bigint() - start) / 1_000_000,
      detail: { source: endpoint.source },
    });

    return true;
  }
}
