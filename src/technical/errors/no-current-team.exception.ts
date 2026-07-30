import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception';

export class NoCurrentTeamException extends DomainException {
  constructor() {
    super(
      HttpStatus.CONFLICT,
      'team.noCurrentTeam',
      'Join a team before creating records owned by one.',
    );
  }
}
