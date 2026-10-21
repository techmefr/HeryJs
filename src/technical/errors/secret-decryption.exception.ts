import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception';

export class SecretDecryptionException extends DomainException {
  readonly context: string;
  readonly keyId: string | null;

  constructor(context: string, keyId: string | null) {
    super(
      HttpStatus.INTERNAL_SERVER_ERROR,
      'secrets.decryptionFailed',
      'A stored secret could not be decrypted.',
    );
    this.context = context;
    this.keyId = keyId;
  }
}
