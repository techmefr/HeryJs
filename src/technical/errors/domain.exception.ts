import { HttpException, HttpStatus } from '@nestjs/common';

export abstract class DomainException extends HttpException {
  readonly key: string;
  // Defaults to `key`. Set explicitly only when `key` cannot address a
  // single catalogue entry on its own -- built dynamically per resource, or
  // shared by several exceptions that mean different things.
  readonly translationKey: string;
  readonly details?: unknown;

  protected constructor(
    status: HttpStatus,
    key: string,
    message: string,
    details?: unknown,
    translationKey?: string,
  ) {
    super(message, status);
    this.key = key;
    this.translationKey = translationKey ?? key;
    this.details = details;
  }
}
