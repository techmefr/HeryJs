import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#technical/errors/domain.exception';

export type SsoConflictReason =
  | 'connection-limit'
  | 'domain-claimed'
  | 'domain-unknown'
  | 'domain-invalid'
  | 'domain-verification-failed';

const STATUS_BY_REASON: Record<SsoConflictReason, HttpStatus> = {
  'connection-limit': HttpStatus.CONFLICT,
  'domain-claimed': HttpStatus.CONFLICT,
  'domain-unknown': HttpStatus.NOT_FOUND,
  'domain-invalid': HttpStatus.UNPROCESSABLE_ENTITY,
  'domain-verification-failed': HttpStatus.UNPROCESSABLE_ENTITY,
};

export class SsoConnectionConflictException extends DomainException {
  readonly reason: SsoConflictReason;

  constructor(reason: SsoConflictReason) {
    super(
      STATUS_BY_REASON[reason],
      `sso.${reason}`,
      `SSO configuration refused: ${reason}.`,
      {
        reason,
      },
    );
    this.reason = reason;
  }
}
