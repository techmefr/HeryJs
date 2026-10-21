import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#technical/errors/domain.exception';

export class TwoFactorEnrolmentRequiredException extends DomainException {
  constructor() {
    super(
      HttpStatus.FORBIDDEN,
      'two-factor.enrolment-required',
      'Your role requires two-factor authentication: enrol before going any further.',
    );
  }
}
