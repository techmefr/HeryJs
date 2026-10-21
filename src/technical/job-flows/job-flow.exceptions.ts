import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#technical/errors/domain.exception';

export class EmptyFlowException extends DomainException {
  constructor(flow: string) {
    super(
      HttpStatus.BAD_REQUEST,
      'jobFlow.empty',
      `Flow "${flow}" has no step to run.`,
      { flow },
    );
  }
}

export class UnknownFlowDefinitionException extends DomainException {
  constructor(name: string) {
    super(
      HttpStatus.NOT_FOUND,
      'jobFlow.definitionNotFound',
      `No flow is defined under "${name}".`,
      { name },
    );
  }
}

/**
 * A retry that found no failed step would answer success while doing nothing,
 * which an operator reads as "the flow is moving again".
 */
export class NothingToRetryException extends DomainException {
  constructor(flowId: string) {
    super(
      HttpStatus.CONFLICT,
      'jobFlow.nothingToRetry',
      'This flow has no failed step to retry.',
      { flowId },
    );
  }
}

/**
 * A step that is running cannot be taken back, and removing the rest of the
 * flow around it would leave its result with nowhere to go.
 */
export class FlowStepRunningException extends DomainException {
  constructor(flowId: string) {
    super(
      HttpStatus.CONFLICT,
      'jobFlow.stepRunning',
      'A step of this flow is running. Cancel it once that step has finished.',
      { flowId },
    );
  }
}

export class DuplicateFlowStepHandlerException extends DomainException {
  constructor(name: string) {
    super(
      HttpStatus.INTERNAL_SERVER_ERROR,
      'jobFlow.handler.duplicate',
      `A flow step handler is already registered for "${name}".`,
      { name },
    );
  }
}

export class UnknownFlowStepException extends DomainException {
  constructor(name: string) {
    super(
      HttpStatus.INTERNAL_SERVER_ERROR,
      'jobFlow.handler.missing',
      `No flow step handler is registered for "${name}". Register it with JobFlowHandlers, then retry the flow.`,
      { name },
    );
  }
}

export class FlowAlreadyFinishedException extends DomainException {
  constructor(flowId: string) {
    super(
      HttpStatus.CONFLICT,
      'jobFlow.alreadyFinished',
      'This flow has already finished or was cancelled, so there is nothing left to cancel.',
      { flowId },
    );
  }
}
