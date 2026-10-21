import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception';

/**
 * A sink configuration the server will not accept: a URL it must not call, a
 * storage driver nothing provides, a kind that needs a field it did not get.
 * The reason is part of the answer because the operator who typed the value is
 * the one who has to change it.
 */
export class AuditSinkRefusedException extends DomainException {
  constructor(reason: string) {
    super(
      HttpStatus.BAD_REQUEST,
      'audit.sink.refused',
      `This audit sink is refused: ${reason}`,
      { reason },
      'audit.sink.refused',
    );
  }
}
