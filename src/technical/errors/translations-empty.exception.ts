import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception';

export class TranslationsEmptyException extends DomainException {
  constructor(field: string) {
    super(
      HttpStatus.BAD_REQUEST,
      'translatable.empty',
      `"${field}" is required and would be left without any translation.`,
      { field },
      'translatable.empty',
    );
  }
}
