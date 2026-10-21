import type { JobPolicy } from '#technical/jobs/job-policy';

/**
 * One unit of work in a chain or a batch. With no `queue` it runs on the flow
 * queue, where the handler registered under `name` runs it. Naming another
 * queue hands the step to that queue's own processor, which is how a flow
 * reuses the export and import processors that already exist.
 */
export interface FlowStep {
  name: string;
  data?: Record<string, unknown>;
  queue?: string;
  policy?: JobPolicy;
}

/** Steps run one after the other: step n starts when step n-1 completed. */
export interface ChainSpec {
  name: string;
  steps: FlowStep[];
}

/**
 * Jobs run independently, and `onComplete` runs once every one of them
 * completed. Without it the batch still ends in an internal step, so the
 * batch has a single root whose completion means the whole set finished.
 */
export interface BatchSpec {
  name: string;
  jobs: FlowStep[];
  onComplete?: FlowStep;
}

export type FlowKind = 'chain' | 'batch';

export type FlowSpec =
  ({ kind: 'chain' } & ChainSpec) | ({ kind: 'batch' } & BatchSpec);

export interface FlowStepRef {
  id: string;
  queue: string;
  name: string;
  role: 'step' | 'callback';
}

export type StepState =
  | 'waiting'
  | 'waiting-children'
  | 'active'
  | 'delayed'
  | 'completed'
  | 'failed'
  | 'expired';

export type FlowState =
  'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'expired';

export interface FlowStepView extends FlowStepRef {
  state: StepState;
  attemptsMade: number;
  failedReason: string | null;
}

export interface FlowProgress {
  completed: number;
  total: number;
}

export interface FlowSummary {
  id: string;
  kind: FlowKind;
  name: string;
  state: FlowState;
  progress: FlowProgress;
  createdAt: Date;
}

export interface FlowDetail extends FlowSummary {
  steps: FlowStepView[];
}

export interface FlowDefinitionView {
  name: string;
  description: string | null;
}

export type FlowBuilder = (input: Record<string, unknown>) => FlowSpec;

export interface FlowStepContext {
  tenantId: string;
  flow: string;
  data: Record<string, unknown>;
  /** What the previous step of a chain returned; undefined for a first step. */
  previous: unknown;
  /** What every job of a batch returned, for the completion callback. */
  results: unknown[];
  attempt: number;
}

export type FlowStepHandler = (context: FlowStepContext) => unknown;
