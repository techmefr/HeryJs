import { HttpStatus } from '@nestjs/common';
import { DomainException } from '@heryjs/core/errors';

export class SsoConnectionNotFoundException extends DomainException {
  constructor() {
    super(
      HttpStatus.NOT_FOUND,
      'sso.connectionNotFound',
      'No such SSO connection.',
    );
  }
}
