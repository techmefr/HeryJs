import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#kernel/public/errors';

export class TwoFactorRequiredByRoleException extends DomainException {
  constructor() {
    super(
      HttpStatus.CONFLICT,
      'two-factor.required-by-role',
      'Your role requires two-factor authentication, so it cannot be turned off.',
    );
  }
}
