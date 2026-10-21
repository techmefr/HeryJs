import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception';

export class EncryptedFieldQueryException extends DomainException {
  constructor(model: string, column: string, use: string) {
    super(
      HttpStatus.INTERNAL_SERVER_ERROR,
      'secrets.encryptedFieldQuery',
      `${model}.${column} is encrypted and cannot be used to ${use}: a comparison of ciphertext is not a comparison of the secret.`,
    );
  }
}
