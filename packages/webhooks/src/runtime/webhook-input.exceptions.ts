import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#kernel/public/errors';

export class WebhookActionNotExposedException extends DomainException {
  constructor(action: string) {
    super(
      HttpStatus.BAD_REQUEST,
      'webhook.actionNotExposed',
      `"${action}" is not an action exposed to webhooks.`,
      { action },
    );
  }
}

export class WebhookBodyInvalidException extends DomainException {
  constructor() {
    super(
      HttpStatus.BAD_REQUEST,
      'webhook.bodyInvalid',
      'Webhook body must be valid JSON.',
    );
  }
}
