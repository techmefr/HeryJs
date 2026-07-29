import { HttpException, HttpStatus } from '@nestjs/common';

export abstract class DomainException extends HttpException {
  readonly key: string;
  readonly details?: unknown;

  protected constructor(
    status: HttpStatus,
    key: string,
    message: string,
    details?: unknown,
  ) {
    super(message, status);
    this.key = key;
    this.details = details;
  }
}
