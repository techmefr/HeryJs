import { HttpStatus } from '@nestjs/common';
import { DomainException } from '@heryjs/core/errors';

export class TwoFactorEnrolmentRequiredException extends DomainException {
  constructor() {
    super(
      HttpStatus.FORBIDDEN,
      'two-factor.enrolment-required',
      'Your role requires two-factor authentication: enrol before going any further.',
    );
  }
}
