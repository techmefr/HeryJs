import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception';

export class TransitionGuardException extends DomainException {
  constructor(resource: string, transition: string, missing: string[]) {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      `${resource}.transitionGuard`,
      `${resource} cannot ${transition} until ${missing.join(', ')} ${missing.length === 1 ? 'has' : 'have'} a value.`,
      { resource, transition, missing },
      'workflow.guardFailed',
    );
  }
}
