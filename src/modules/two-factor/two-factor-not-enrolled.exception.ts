import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#technical/errors/domain.exception';

export class TwoFactorNotEnrolledException extends DomainException {
  constructor() {
    super(
      HttpStatus.CONFLICT,
      'two-factor.not-enrolled',
      'Two-factor authentication is not set up.',
    );
  }
}
