import { getQueueToken, InjectFlowProducer } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { FlowProducer, Job, Queue } from 'bullmq';
import { RecordNotFoundException } from '#technical/errors/record-not-found.exception';
import type { Page, PageQuery } from '#technical/http/page-query';
import { FLOW_PRODUCER, FLOW_QUEUE } from '#technical/jobs/jobs.constants';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import {
  FlowAlreadyFinishedException,
  FlowStepRunningException,
  NothingToRetryException,
  UnknownFlowDefinitionException,
} from './job-flow.exceptions';
import { flowProgress, flowState, stepStateOf } from './job-flow.state';
import { JobFlowStore } from './job-flow.store';
import type { JobFlowRow } from './job-flow.store';
import { buildFlowTree, flowStepRefs } from './job-flow.tree';
import type {
  BatchSpec,
  ChainSpec,
  FlowBuilder,
  FlowDefinitionView,
  FlowDetail,
  FlowSpec,
  FlowStepView,
  FlowSummary,
} from './job-flow.types';

export interface FlowStartOptions {
  /** Defaults to the tenant of the request or job the call is made from. */
  tenantId?: string;
  /** Where steps that name no queue of their own run. Defaults to the flow queue. */
  queue?: string;
}

interface FlowDefinition {
  build: FlowBuilder;
  description: string | null;
}

/**
 * Chains and batches on top of BullMQ flows. A chain or a batch is one tree of
 * jobs created in a single Redis call, so it survives a worker restart the way
 * any queued job does, and a step that exhausted its attempts leaves the jobs
 * after it waiting rather than failing them: retrying that one job is what
 * resumes the flow, and the steps that already completed are never run again.
 */
@Injectable()
export class JobFlowsService {
  private readonly definitions = new Map<string, FlowDefinition>();

  constructor(
    @InjectFlowProducer(FLOW_PRODUCER) private readonly producer: FlowProducer,
    private readonly moduleRef: ModuleRef,
    private readonly store: JobFlowStore,
  ) {}

  chain(spec: ChainSpec, options: FlowStartOptions = {}): Promise<FlowDetail> {
    return this.start({ kind: 'chain', ...spec }, options);
  }

  batch(spec: BatchSpec, options: FlowStartOptions = {}): Promise<FlowDetail> {
    return this.start({ kind: 'batch', ...spec }, options);
  }

  /**
   * A flow an operator can start by name from the admin: the shape is code,
   * only the input comes from the caller.
   */
  define(name: string, build: FlowBuilder, description?: string): void {
    this.definitions.set(name, { build, description: description ?? null });
  }

  listDefinitions(): FlowDefinitionView[] {
    return [...this.definitions.entries()].map(([name, definition]) => ({
      name,
      description: definition.description,
    }));
  }

  startDefined(
    name: string,
    input: Record<string, unknown>,
    options: FlowStartOptions = {},
  ): Promise<FlowDetail> {
    const definition = this.definitions.get(name);

    if (!definition) {
      throw new UnknownFlowDefinitionException(name);
    }

    return this.start(definition.build(input), options);
  }

  async list(tenantId: string, page: PageQuery): Promise<Page<FlowSummary>> {
    const rows = await this.store.list(tenantId, page);

    return {
      total: rows.total,
      records: await Promise.all(
        rows.records.map(async (row) => summaryOf(row, await this.views(row))),
      ),
    };
  }

  async detail(tenantId: string, id: string): Promise<FlowDetail> {
    const row = await this.require(tenantId, id);

    return detailOf(row, await this.views(row));
  }

  /**
   * Re-queues every failed step with a fresh set of attempts. The steps that
   * completed stay completed and their results stay with the parents that
   * read them, so the flow carries on from where it stopped.
   */
  async retry(tenantId: string, id: string): Promise<FlowDetail> {
    const row = await this.require(tenantId, id);
    let retried = 0;

    for (const step of row.steps) {
      const job = await this.findJob(step.queue, step.id);

      if (job && (await job.getState()) === 'failed') {
        await job.retry('failed', { resetAttemptsMade: true });
        retried += 1;
      }
    }

    if (retried === 0) {
      throw new NothingToRetryException(id);
    }

    return this.detail(tenantId, id);
  }

  /**
   * Removes everything that has not run. A step already running is not
   * interrupted, so the cancel is refused until it has finished.
   */
  async cancel(tenantId: string, id: string): Promise<FlowDetail> {
    const row = await this.require(tenantId, id);
    const views = await this.views(row);
    const state = flowState(views, row.cancelledAt !== null);

    if (state === 'completed' || state === 'cancelled' || state === 'expired') {
      throw new FlowAlreadyFinishedException(id);
    }

    if (views.some((step) => step.state === 'active')) {
      throw new FlowStepRunningException(id);
    }

    const root = await this.findJob(row.queue, row.rootJobId);

    await root?.remove({ removeChildren: true });
    await this.store.markCancelled(tenantId, id);

    return this.detail(tenantId, id);
  }

  async prune(olderThan: Date): Promise<number> {
    return this.store.prune(olderThan);
  }

  private async start(
    spec: FlowSpec,
    options: FlowStartOptions,
  ): Promise<FlowDetail> {
    const tenantId = options.tenantId ?? TenantContextStorage.getTenantId();
    const tree = await this.producer.add(
      buildFlowTree(spec, tenantId, options.queue),
    );
    const steps = flowStepRefs(spec.kind, tree);

    const row = await this.store.create({
      tenantId,
      kind: spec.kind,
      name: spec.name,
      queue: tree.job.queueName ?? FLOW_QUEUE,
      rootJobId: tree.job.id as string,
      steps,
      createdById: TenantContextStorage.current()?.userId ?? null,
    });

    return detailOf(row, await this.views(row));
  }

  /**
   * Any queue the application registered, not only the kernel's: a step may
   * name a queue a project added, and the state of its job has to be read
   * from that same queue. A queue that no longer exists holds no job, which a
   * flow reports the way it reports a job past its retention: expired.
   */
  private async findJob(
    queueName: string,
    jobId: string,
  ): Promise<Job | undefined> {
    try {
      return await this.moduleRef
        .get<Queue>(getQueueToken(queueName), { strict: false })
        .getJob(jobId);
    } catch {
      return undefined;
    }
  }

  private async require(tenantId: string, id: string): Promise<JobFlowRow> {
    const row = await this.store.find(tenantId, id);

    if (!row) {
      throw new RecordNotFoundException('JobFlow');
    }

    return row;
  }

  private views(row: JobFlowRow): Promise<FlowStepView[]> {
    return Promise.all(
      row.steps.map(async (step) => {
        const job = await this.findJob(step.queue, step.id);

        if (!job) {
          return {
            ...step,
            state: 'expired' as const,
            attemptsMade: 0,
            failedReason: null,
          };
        }

        return {
          ...step,
          state: stepStateOf(await job.getState()),
          attemptsMade: job.attemptsMade,
          failedReason: job.failedReason ?? null,
        };
      }),
    );
  }
}

function summaryOf(row: JobFlowRow, steps: FlowStepView[]): FlowSummary {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    state: flowState(steps, row.cancelledAt !== null),
    progress: flowProgress(steps),
    createdAt: row.createdAt,
  };
}

function detailOf(row: JobFlowRow, steps: FlowStepView[]): FlowDetail {
  return { ...summaryOf(row, steps), steps };
}
