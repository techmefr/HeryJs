import { Injectable } from '@nestjs/common';
import { DuplicateFlowStepHandlerException } from './job-flow.exceptions';
import type { FlowStepHandler } from './job-flow.types';

/**
 * What runs a step that names no queue of its own. A step's `name` is the key,
 * the same way a job name keys a processor's own dispatch, except that an
 * unknown name here fails the step instead of completing it: the queue is
 * dedicated to flows, so a name nobody handles is a missing registration, and
 * a failed step is the state an operator can see and retry once it is fixed.
 */
@Injectable()
export class JobFlowHandlers {
  private readonly handlers = new Map<string, FlowStepHandler>();

  register(name: string, handler: FlowStepHandler): void {
    if (this.handlers.has(name)) {
      throw new DuplicateFlowStepHandlerException(name);
    }

    this.handlers.set(name, handler);
  }

  find(name: string): FlowStepHandler | undefined {
    return this.handlers.get(name);
  }
}
