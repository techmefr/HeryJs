import { HttpStatus } from '@nestjs/common';
import { DomainException } from '@heryjs/core/errors';

export class InvalidTwoFactorCodeException extends DomainException {
  constructor() {
    super(
      HttpStatus.BAD_REQUEST,
      'two-factor.code.invalid',
      'That code is not valid.',
    );
  }
}
