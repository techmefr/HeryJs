import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#technical/errors/domain.exception';

/**
 * Only a store can answer for what was logged, and a project that ships to
 * stdout and a collector has none. A 404 says the route has nothing behind it,
 * rather than answering with an empty page that reads as "nothing was logged".
 */
export class LogQueryUnavailableException extends DomainException {
  constructor() {
    super(
      HttpStatus.NOT_FOUND,
      'log.query-unavailable',
      'No logging driver that keeps what it was given is declared, so there is nothing to query. Declare the "database" driver under logging.drivers in hery.config.ts.',
    );
  }
}
