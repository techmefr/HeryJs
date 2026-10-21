import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception';

export class SlugTakenException extends DomainException {
  constructor(field: string, slug: string) {
    super(
      HttpStatus.CONFLICT,
      'slug.taken',
      `'${slug}' is already used as ${field} in this tenant.`,
      { field, slug },
      'slug.taken',
    );
  }
}
