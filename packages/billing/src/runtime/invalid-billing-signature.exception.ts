import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#kernel/errors/domain.exception';

// Generic on purpose, the same reasoning as the inbound webhooks module: a
// specific reason ("bad signature" vs "unattributed tenant") handed back to
// the caller is a probe an attacker gets for free. The real reason goes to
// the pipeline trace, which only a developer of this app can read.
export class InvalidBillingSignatureException extends DomainException {
  constructor() {
    super(HttpStatus.UNAUTHORIZED, 'billing.invalidSignature', 'Rejected.');
  }
}
