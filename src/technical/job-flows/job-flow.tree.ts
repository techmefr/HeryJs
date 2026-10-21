import type { FlowJob, JobNode } from 'bullmq';
import { jobOptions } from '#technical/jobs/job-policy';
import { FLOW_QUEUE } from '#technical/jobs/jobs.constants';
import { EmptyFlowException } from './job-flow.exceptions';
import type { FlowSpec, FlowStep, FlowStepRef } from './job-flow.types';

export const FLOW_DONE_JOB = 'flow.done';

/**
 * How long a flow's jobs, finished or failed, stay in Redis, and how long its
 * registry row stays in the database. A flow is resumable for exactly as long
 * as its failed job exists, so the window is a time and not a count: a count
 * would let a busy queue trim the one failed step an operator had not got to.
 */
export const FLOW_RETENTION_DAYS = 7;

const SECONDS_PER_DAY = 24 * 60 * 60;

function flowJobOptions(step: FlowStep) {
  const retention = { age: FLOW_RETENTION_DAYS * SECONDS_PER_DAY };

  return {
    ...jobOptions(step.policy),
    removeOnComplete: retention,
    removeOnFail: retention,
  };
}

function node(
  step: FlowStep,
  tenantId: string,
  flow: string,
  queue: string,
  children?: FlowJob[],
): FlowJob {
  return {
    name: step.name,
    queueName: step.queue ?? queue,
    data: { ...step.data, tenantId, flow },
    opts: flowJobOptions(step),
    ...(children ? { children } : {}),
  };
}

/**
 * BullMQ runs a parent after all of its children, so a chain is written
 * backwards: the last step is the root and each earlier step is the only child
 * of the one after it. A failed child leaves its parent waiting, which is what
 * makes a retry of that one job enough to carry the flow on.
 */
export function buildFlowTree(
  spec: FlowSpec,
  tenantId: string,
  queue: string = FLOW_QUEUE,
): FlowJob {
  if (spec.kind === 'chain') {
    if (spec.steps.length === 0) {
      throw new EmptyFlowException(spec.name);
    }

    let child: FlowJob | undefined;

    for (const step of spec.steps) {
      child = node(
        step,
        tenantId,
        spec.name,
        queue,
        child ? [child] : undefined,
      );
    }

    return child as FlowJob;
  }

  if (spec.jobs.length === 0) {
    throw new EmptyFlowException(spec.name);
  }

  return node(
    spec.onComplete ?? { name: FLOW_DONE_JOB },
    tenantId,
    spec.name,
    queue,
    spec.jobs.map((step) => node(step, tenantId, spec.name, queue)),
  );
}

function refOf(job: JobNode['job'], role: FlowStepRef['role']): FlowStepRef {
  return {
    id: job.id as string,
    queue: job.queueName,
    name: job.name,
    role,
  };
}

/** The jobs of a created flow in the order they run, ending on the root. */
export function flowStepRefs(
  kind: FlowSpec['kind'],
  root: JobNode,
): FlowStepRef[] {
  if (kind === 'batch') {
    return [
      ...(root.children ?? []).map((child) => refOf(child.job, 'step')),
      refOf(root.job, 'callback'),
    ];
  }

  const refs: FlowStepRef[] = [];
  let current: JobNode | undefined = root;

  while (current) {
    refs.unshift(refOf(current.job, 'step'));
    current = current.children?.[0];
  }

  return refs;
}
