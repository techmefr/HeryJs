import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception';

export class IfMatchSingleEntryException extends DomainException {
  constructor(entryCount: number) {
    super(
      HttpStatus.BAD_REQUEST,
      'record.ifMatchSingleEntry',
      'If-Match applies to a request carrying exactly one entry; send each entry\'s "version" in the body instead.',
      { entryCount },
    );
  }
}

export class IfMatchMalformedException extends DomainException {
  constructor(header: string) {
    super(
      HttpStatus.BAD_REQUEST,
      'record.ifMatchMalformed',
      'If-Match must carry the version you read, quoted: "3".',
      { header },
    );
  }
}
