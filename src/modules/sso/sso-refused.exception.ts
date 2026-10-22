import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#technical/errors/domain.exception';

export type SsoRefusalReason =
  | 'no-connection'
  | 'connection-disabled'
  | 'invalid-state'
  | 'access-denied'
  | 'provider-failure'
  | 'email-missing'
  | 'email-unverified'
  | 'email-domain-not-verified'
  | 'account-exists'
  | 'identity-linked-elsewhere'
  | 'user-banned'
  | 'untrusted-issuer'
  | 'invalid-assertion';

const STATUS_BY_REASON: Record<SsoRefusalReason, HttpStatus> = {
  'no-connection': HttpStatus.NOT_FOUND,
  'connection-disabled': HttpStatus.FORBIDDEN,
  'invalid-state': HttpStatus.BAD_REQUEST,
  'access-denied': HttpStatus.FORBIDDEN,
  'provider-failure': HttpStatus.BAD_GATEWAY,
  'email-missing': HttpStatus.UNPROCESSABLE_ENTITY,
  'email-unverified': HttpStatus.UNPROCESSABLE_ENTITY,
  'email-domain-not-verified': HttpStatus.FORBIDDEN,
  'account-exists': HttpStatus.CONFLICT,
  'identity-linked-elsewhere': HttpStatus.CONFLICT,
  'user-banned': HttpStatus.FORBIDDEN,
  'untrusted-issuer': HttpStatus.UNPROCESSABLE_ENTITY,
  'invalid-assertion': HttpStatus.BAD_REQUEST,
};

export class SsoRefusedException extends DomainException {
  readonly reason: SsoRefusalReason;

  constructor(reason: SsoRefusalReason) {
    super(
      STATUS_BY_REASON[reason],
      `sso.${reason}`,
      `Single sign-on refused: ${reason}.`,
      {
        reason,
      },
      'sso.refused',
    );
    this.reason = reason;
  }
}
