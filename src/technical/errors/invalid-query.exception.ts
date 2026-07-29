import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception';

export class InvalidQueryException extends DomainException {
  constructor(param: string, allowed: readonly (string | number)[]) {
    super(
      HttpStatus.BAD_REQUEST,
      'query.invalid',
      `Invalid value for "${param}". Allowed: ${allowed.join(', ')}.`,
      { param, allowed },
    );
  }
}
