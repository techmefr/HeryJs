import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { TraceContextStorage } from '#kernel/tracing/trace-context';
import type { BillingEvent } from '#kernel/billing/billing-driver';
import { BillingDriverRegistry } from './billing-driver.registry';
import { InvalidBillingSignatureException } from './invalid-billing-signature.exception';

export type RequestWithBillingEvents = RawBodyRequest<Request> & {
  billingEvents: BillingEvent[];
};

/**
 * Verification and parsing both happen here, before the handler, the same
 * reasoning as the generic webhooks module's own guard: an inbound request
 * with no session has its credential checked as a gate, visible in the
 * pipeline trace, not buried inside a service.
 *
 * Parsing lives in the guard rather than the controller because the driver's
 * `parseWebhook` is also where a bad signature and an unattributed tenant
 * throw -- splitting "verify" from "parse" into two calls would mean either
 * doing the HMAC check twice or exposing a half-verified event to the
 * controller.
 */
@Injectable()
export class BillingWebhookGuard implements CanActivate {
  constructor(private readonly drivers: BillingDriverRegistry) {}

  canActivate(context: ExecutionContext): boolean {
    const start = process.hrtime.bigint();
    const request = context
      .switchToHttp()
      .getRequest<RequestWithBillingEvents>();

    const rejection = (reason: string) => {
      TraceContextStorage.pushStep({
        stage: 'guard',
        label: 'billing webhook signature',
        status: 'blocked',
        durationMs: Number(process.hrtime.bigint() - start) / 1_000_000,
        detail: { reason },
      });

      return new InvalidBillingSignatureException();
    };

    const signature =
      request.header('stripe-signature') ?? request.header('x-signature');

    if (!signature) {
      throw rejection('missing signature header');
    }

    try {
      request.billingEvents = this.drivers.active.parseWebhook(
        request.rawBody ?? Buffer.alloc(0),
        signature,
      );
    } catch {
      throw rejection('signature rejected by the driver');
    }

    TraceContextStorage.pushStep({
      stage: 'guard',
      label: 'billing webhook signature',
      status: 'ok',
      durationMs: Number(process.hrtime.bigint() - start) / 1_000_000,
      detail: { events: request.billingEvents.length },
    });

    return true;
  }
}
