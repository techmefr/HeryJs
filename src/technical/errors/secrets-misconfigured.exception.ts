import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception';

export class SecretsMisconfiguredException extends DomainException {
  constructor(reason: string) {
    super(
      HttpStatus.INTERNAL_SERVER_ERROR,
      'secrets.misconfigured',
      `Secrets are not configured correctly: ${reason}`,
    );
  }
}
