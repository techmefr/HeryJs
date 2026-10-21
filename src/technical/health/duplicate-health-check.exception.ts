import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#technical/errors/domain.exception';

export class DuplicateHealthCheckException extends DomainException {
  constructor(name: string) {
    super(
      HttpStatus.INTERNAL_SERVER_ERROR,
      'health.check.duplicate',
      `A health check named "${name}" is already registered.`,
      { name },
    );
  }
}
