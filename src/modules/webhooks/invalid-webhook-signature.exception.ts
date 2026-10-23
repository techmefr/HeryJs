import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#technical/public/errors';

// The message stays generic on purpose: telling a caller whether the
// endpoint id, the signature, or the timestamp window was the problem hands
// an attacker a probe for free. Every rejection reason collapses to the
// same response.
export class InvalidWebhookSignatureException extends DomainException {
  constructor() {
    super(HttpStatus.UNAUTHORIZED, 'webhook.invalidSignature', 'Rejected.');
  }
}
