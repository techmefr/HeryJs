import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#technical/errors/domain.exception';

export type WebhookRefusedReason =
  'url-refused' | 'subscription-limit' | 'delivery-not-dead';

const STATUS_BY_REASON: Record<WebhookRefusedReason, HttpStatus> = {
  'url-refused': HttpStatus.UNPROCESSABLE_ENTITY,
  'subscription-limit': HttpStatus.CONFLICT,
  'delivery-not-dead': HttpStatus.CONFLICT,
};

const MESSAGE_BY_REASON: Record<WebhookRefusedReason, string> = {
  'url-refused': 'The URL must be a public https address.',
  'subscription-limit': 'This tenant has reached its subscription limit.',
  'delivery-not-dead': 'Only a dead delivery can be redelivered.',
};

export class WebhookRefusedException extends DomainException {
  readonly reason: WebhookRefusedReason;

  constructor(reason: WebhookRefusedReason) {
    super(
      STATUS_BY_REASON[reason],
      `webhook.${reason}`,
      MESSAGE_BY_REASON[reason],
      {
        reason,
      },
      'webhook.refused',
    );
    this.reason = reason;
  }
}
