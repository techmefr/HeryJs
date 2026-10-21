import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception';

export class IllegalTransitionException extends DomainException {
  constructor(
    resource: string,
    transition: string,
    current: string,
    allowedFrom: readonly string[],
  ) {
    super(
      HttpStatus.CONFLICT,
      `${resource}.illegalTransition`,
      `${resource} cannot ${transition} from "${current}": it is allowed from ${allowedFrom.map((state) => `"${state}"`).join(', ')}.`,
      { resource, transition, current, allowedFrom: [...allowedFrom] },
      'workflow.illegalTransition',
    );
  }
}
