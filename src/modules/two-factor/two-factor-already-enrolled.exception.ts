import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#technical/public/errors';

export class TwoFactorAlreadyEnrolledException extends DomainException {
  constructor() {
    super(
      HttpStatus.CONFLICT,
      'two-factor.already-enrolled',
      'Two-factor authentication is already enabled.',
    );
  }
}
