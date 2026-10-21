import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception';

export class VersionRequiredException extends DomainException {
  constructor(resource: string) {
    super(
      HttpStatus.PRECONDITION_REQUIRED,
      'record.versionRequired',
      `${resource} is versioned: send the version you read, in the entry's "version" field or in an If-Match header.`,
      { resource },
    );
  }
}
