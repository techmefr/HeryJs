import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#kernel/errors/domain.exception';

export class InvalidTwoFactorCodeException extends DomainException {
  constructor() {
    super(
      HttpStatus.BAD_REQUEST,
      'two-factor.code.invalid',
      'That code is not valid.',
    );
  }
}
