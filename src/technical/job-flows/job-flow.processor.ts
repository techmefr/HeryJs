import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { FLOW_QUEUE } from '#technical/jobs/jobs.constants';
import { runInTenant } from '#technical/tenancy/run-in-tenant';
import { UnknownFlowStepException } from './job-flow.exceptions';
import { JobFlowHandlers } from './job-flow-handlers';
import { FLOW_DONE_JOB } from './job-flow.tree';

@Processor(FLOW_QUEUE)
export class JobFlowProcessor extends WorkerHost {
  constructor(private readonly handlers: JobFlowHandlers) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    const values = Object.values(await job.getChildrenValues());

    if (job.name === FLOW_DONE_JOB) {
      return { completed: values.length };
    }

    const handler = this.handlers.find(job.name);

    if (!handler) {
      throw new UnknownFlowStepException(job.name);
    }

    const { tenantId, flow, ...data } = job.data as Record<string, unknown> & {
      tenantId: string;
      flow: string;
    };

    return runInTenant(tenantId, () =>
      Promise.resolve(
        handler({
          tenantId,
          flow,
          data,
          previous: values[0],
          results: values,
          attempt: job.attemptsMade + 1,
        }),
      ),
    );
  }
}
