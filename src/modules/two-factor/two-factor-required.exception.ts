import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#technical/public/errors';

export class TwoFactorRequiredException extends DomainException {
  constructor() {
    super(
      HttpStatus.FORBIDDEN,
      'two-factor.required',
      'This session has not passed its second factor yet.',
    );
  }
}
