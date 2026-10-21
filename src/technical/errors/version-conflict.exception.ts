import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception';

export type VersionSource = 'body' | 'header';

export class VersionConflictException extends DomainException {
  constructor(
    resource: string,
    expected: number,
    current: number | null,
    source: VersionSource,
  ) {
    const isHeader = source === 'header';

    super(
      isHeader ? HttpStatus.PRECONDITION_FAILED : HttpStatus.CONFLICT,
      isHeader ? 'record.preconditionFailed' : 'record.versionConflict',
      `${resource} was changed since you read it (you sent version ${expected}${current === null ? '' : `, it is now at ${current}`}). Reload it and apply your change again.`,
      { resource, expected, current },
      isHeader ? 'record.preconditionFailed' : 'record.versionConflict',
    );
  }
}
