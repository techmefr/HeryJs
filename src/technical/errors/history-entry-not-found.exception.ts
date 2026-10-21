import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception';

export class HistoryEntryNotFoundException extends DomainException {
  constructor(resource: string, entryId: string) {
    super(
      HttpStatus.NOT_FOUND,
      `${resource}.historyEntryNotFound`,
      `${resource} has no history entry ${entryId}.`,
      { resource, entryId },
      'record.historyEntryNotFound',
    );
  }
}
