import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#technical/public/errors';

export type SsoConflictReason =
  | 'connection-limit'
  | 'domain-claimed'
  | 'domain-unknown'
  | 'domain-invalid'
  | 'domain-verification-failed'
  | 'protocol-mismatch'
  | 'saml-certificate-invalid'
  | 'saml-entry-point-insecure'
  | 'saml-metadata-invalid'
  | 'saml-incomplete';

const STATUS_BY_REASON: Record<SsoConflictReason, HttpStatus> = {
  'connection-limit': HttpStatus.CONFLICT,
  'domain-claimed': HttpStatus.CONFLICT,
  'domain-unknown': HttpStatus.NOT_FOUND,
  'domain-invalid': HttpStatus.UNPROCESSABLE_ENTITY,
  'domain-verification-failed': HttpStatus.UNPROCESSABLE_ENTITY,
  'protocol-mismatch': HttpStatus.UNPROCESSABLE_ENTITY,
  'saml-certificate-invalid': HttpStatus.UNPROCESSABLE_ENTITY,
  'saml-entry-point-insecure': HttpStatus.UNPROCESSABLE_ENTITY,
  'saml-metadata-invalid': HttpStatus.UNPROCESSABLE_ENTITY,
  'saml-incomplete': HttpStatus.UNPROCESSABLE_ENTITY,
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
      'sso.connectionConflict',
    );
    this.reason = reason;
  }
}
