import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception';

export class ApiKeySessionManagementException extends DomainException {
  constructor() {
    super(
      HttpStatus.FORBIDDEN,
      'apiKey.sessionsForbidden',
      'An API key cannot manage sessions or passwords.',
    );
  }
}
