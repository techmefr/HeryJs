import type {
  FlowProgress,
  FlowState,
  FlowStepView,
  StepState,
} from './job-flow.types';

/**
 * BullMQ reports more states than an operator needs: a prioritized job is a
 * waiting one, and `unknown` means the job is gone, which for a flow can only
 * mean its retention window ended.
 */
export function stepStateOf(bullState: string): StepState {
  switch (bullState) {
    case 'waiting':
    case 'waiting-children':
    case 'active':
    case 'delayed':
    case 'completed':
    case 'failed':
      return bullState;
    case 'prioritized':
      return 'waiting';
    default:
      return 'expired';
  }
}

/**
 * The root is the last step to run, so its completion is the flow's. A failed
 * step wins over everything else still pending, because that is the one fact an
 * operator has to act on; a step in its backoff is `delayed`, not failed, since
 * its retry policy has not given up yet.
 */
export function flowState(
  steps: Pick<FlowStepView, 'state'>[],
  isCancelled: boolean,
): FlowState {
  if (isCancelled) {
    return 'cancelled';
  }

  if (steps[steps.length - 1]?.state === 'completed') {
    return 'completed';
  }

  if (steps.some((step) => step.state === 'failed')) {
    return 'failed';
  }

  if (steps.some((step) => step.state === 'expired')) {
    return 'expired';
  }

  const hasStarted = steps.some(
    (step) =>
      step.state === 'active' ||
      step.state === 'delayed' ||
      step.state === 'completed',
  );

  return hasStarted ? 'running' : 'queued';
}

export function flowProgress(
  steps: Pick<FlowStepView, 'state'>[],
): FlowProgress {
  return {
    completed: steps.filter((step) => step.state === 'completed').length,
    total: steps.length,
  };
}
