import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception';

export class TenantErasureNotConfirmedException extends DomainException {
  constructor() {
    super(
      HttpStatus.BAD_REQUEST,
      'privacy.tenantErasureNotConfirmed',
      'Erasing a tenant needs "confirm" to name the tenant being erased.',
    );
  }
}
