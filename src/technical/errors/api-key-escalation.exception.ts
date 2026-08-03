import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception';

export class ApiKeyEscalationException extends DomainException {
  constructor() {
    super(
      HttpStatus.FORBIDDEN,
      'apiKey.forbidden',
      'An API key cannot manage API keys.',
    );
  }
}
