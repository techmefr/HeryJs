import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#kernel/errors/domain.exception';

/**
 * A module raises the kernel's own exception type rather than a NestJS
 * HttpException, so its failure carries a translation key and comes out of the
 * one filter every other error in the project goes through.
 */
export class MaintenanceException extends DomainException {
  constructor() {
    super(
      HttpStatus.SERVICE_UNAVAILABLE,
      'maintenance.enabled',
      'The application is under maintenance. Try again shortly.',
    );
  }
}
