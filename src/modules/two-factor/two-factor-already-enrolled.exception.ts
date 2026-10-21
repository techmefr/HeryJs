import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#technical/errors/domain.exception';

export class TwoFactorAlreadyEnrolledException extends DomainException {
  constructor() {
    super(
      HttpStatus.CONFLICT,
      'two-factor.already-enrolled',
      'Two-factor authentication is already enabled.',
    );
  }
}
