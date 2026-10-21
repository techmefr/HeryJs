import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#kernel/errors/domain.exception';

export type OAuthRefusalReason =
  | 'email-missing'
  | 'email-unverified'
  | 'account-exists'
  | 'identity-linked-elsewhere'
  | 'sign-up-disabled'
  | 'user-banned'
  | 'linking-disabled'
  | 'invalid-state'
  | 'unknown-provider'
  | 'access-denied'
  | 'provider-failure';

const STATUS_BY_REASON: Record<OAuthRefusalReason, HttpStatus> = {
  'email-missing': HttpStatus.UNPROCESSABLE_ENTITY,
  'email-unverified': HttpStatus.UNPROCESSABLE_ENTITY,
  'account-exists': HttpStatus.CONFLICT,
  'identity-linked-elsewhere': HttpStatus.CONFLICT,
  'sign-up-disabled': HttpStatus.FORBIDDEN,
  'user-banned': HttpStatus.FORBIDDEN,
  'linking-disabled': HttpStatus.FORBIDDEN,
  'invalid-state': HttpStatus.BAD_REQUEST,
  'unknown-provider': HttpStatus.NOT_FOUND,
  'access-denied': HttpStatus.FORBIDDEN,
  'provider-failure': HttpStatus.BAD_GATEWAY,
};

export class OAuthRefusedException extends DomainException {
  readonly reason: OAuthRefusalReason;

  constructor(reason: OAuthRefusalReason) {
    super(
      STATUS_BY_REASON[reason],
      `oauth.${reason}`,
      `Social sign-in refused: ${reason}.`,
      { reason },
    );
    this.reason = reason;
  }
}
