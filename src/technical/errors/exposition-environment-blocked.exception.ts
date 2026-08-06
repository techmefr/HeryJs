import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception';

export class ExpositionEnvironmentBlockedException extends DomainException {
  constructor(action: string) {
    super(
      HttpStatus.FORBIDDEN,
      'exposition.environmentBlocked',
      `"${action}" is not exposed in this environment.`,
    );
  }
}
