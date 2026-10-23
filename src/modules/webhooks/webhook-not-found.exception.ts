import { HttpStatus } from '@nestjs/common';
import { DomainException } from '@heryjs/core/errors';

export type WebhookNotFoundSubject = 'subscription' | 'delivery';

export class WebhookNotFoundException extends DomainException {
  constructor(subject: WebhookNotFoundSubject) {
    super(
      HttpStatus.NOT_FOUND,
      `webhook.${subject}NotFound`,
      `No such webhook ${subject}.`,
      { subject },
      'webhook.notFound',
    );
  }
}
