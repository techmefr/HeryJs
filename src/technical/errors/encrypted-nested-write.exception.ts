import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception';

export class EncryptedNestedWriteException extends DomainException {
  constructor(model: string, relation: string, target: string) {
    super(
      HttpStatus.INTERNAL_SERVER_ERROR,
      'secrets.encryptedNestedWrite',
      `${model}.${relation} writes into ${target}, which has encrypted columns. A nested write skips encryption, so write ${target} directly.`,
    );
  }
}
