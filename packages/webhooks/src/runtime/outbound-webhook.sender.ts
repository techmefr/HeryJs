import { Inject, Injectable } from '@nestjs/common';
import {
  DELIVERY_ERROR_MAX_LENGTH,
  DELIVERY_TIMEOUT_MS,
} from './outbound-webhook.constants';
import { outboundWebhookEnv } from './outbound-webhook.env';
import { signOutboundWebhook } from './outbound-webhook-signature';
import {
  assertDeliverableUrl,
  WEBHOOK_HOST_RESOLVER,
} from './webhook-url-guard';
import type { WebhookHostResolver } from './webhook-url-guard';

export type WebhookFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export const WEBHOOK_FETCH = Symbol('WEBHOOK_FETCH');

export interface OutboundRequest {
  url: string;
  deliveryId: string;
  event: string;
  attempt: number;
  body: string;
  secrets: readonly string[];
}

export interface OutboundResult {
  isDelivered: boolean;
  statusCode: number | null;
  error: string | null;
}

function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  return message.slice(0, DELIVERY_ERROR_MAX_LENGTH);
}

/**
 * One HTTP attempt, reported as a value: whatever goes wrong is a failed
 * attempt for the queue to retry, never an exception that escapes the
 * processor. A redirect is a failure, not something followed, so a customer URL
 * cannot bounce the request to an address the URL check would have refused.
 * The response body is never read: only the status says whether it landed.
 */
@Injectable()
export class OutboundWebhookSender {
  constructor(
    @Inject(WEBHOOK_FETCH) private readonly fetchImpl: WebhookFetch,
    @Inject(WEBHOOK_HOST_RESOLVER)
    private readonly resolve: WebhookHostResolver,
  ) {}

  async send(request: OutboundRequest): Promise<OutboundResult> {
    try {
      await assertDeliverableUrl(
        request.url,
        this.resolve,
        outboundWebhookEnv.WEBHOOK_ALLOW_PRIVATE_URLS,
      );

      const rawBody = Buffer.from(request.body, 'utf8');
      const timestamp = String(Date.now());
      const response = await this.fetchImpl(request.url, {
        method: 'POST',
        redirect: 'manual',
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
        headers: {
          'content-type': 'application/json',
          'user-agent': 'HeryJs-Webhooks/1',
          'x-webhook-id': request.deliveryId,
          'x-webhook-event': request.event,
          'x-webhook-attempt': String(request.attempt),
          'x-webhook-timestamp': timestamp,
          'x-webhook-signature': signOutboundWebhook(
            request.secrets,
            timestamp,
            rawBody,
          ),
        },
        body: request.body,
      });

      await response.body?.cancel().catch(() => undefined);

      const isDelivered = response.status >= 200 && response.status < 300;

      return {
        isDelivered,
        statusCode: response.status,
        error: isDelivered ? null : `The endpoint answered ${response.status}.`,
      };
    } catch (error) {
      return { isDelivered: false, statusCode: null, error: describe(error) };
    }
  }
}
