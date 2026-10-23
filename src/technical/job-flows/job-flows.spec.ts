import { randomUUID } from 'node:crypto';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Worker } from 'bullmq';
import type { Queue } from 'bullmq';
import IORedis from 'ioredis';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { env } from '#technical/config/env';
import { registerAndLogin } from '#devtools/testing/register-and-login';
import type { TestUser } from '#devtools/testing/register-and-login';
import { RUN_ONCE_POLICY } from '#technical/jobs/job-policy';
import { waitFor } from '#devtools/testing/wait-for';
import { JobFlowHandlers } from './job-flow-handlers';
import { JobFlowProcessor } from './job-flow.processor';
import { JobFlowsService } from './job-flows.service';
import type { FlowDetail, FlowState } from './job-flow.types';

// Flow jobs of every spec file share one Redis, and every booted application
// runs a worker on the flow queue that only knows its own process's handlers.
// This file's flows run on a queue of their own, served by a worker below.
const SPEC_QUEUE = `heryjs-flows-spec-${randomUUID()}`;

const FAST_RETRY = { ...RUN_ONCE_POLICY };

async function becomeAdmin(user: TestUser): Promise<void> {
  await authPrismaClient.user.update({
    where: { id: user.id },
    data: { role: 'admin' },
  });
}

async function waitForState(
  flows: JobFlowsService,
  tenantId: string,
  id: string,
  wanted: FlowState,
  timeoutMs = 8000,
): Promise<FlowDetail> {
  return waitFor(
    async () => {
      const detail = await flows.detail(tenantId, id);

      return detail.state === wanted ? detail : null;
    },
    { timeoutMs, intervalMs: 100, description: `flow ${id} to be ${wanted}` },
  );
}

function serve(processor: JobFlowProcessor, connection: IORedis): Worker {
  return new Worker(SPEC_QUEUE, (job) => processor.process(job), {
    connection,
  });
}

async function boot(): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule, BullModule.registerQueue({ name: SPEC_QUEUE })],
  }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  await app.init();

  return app;
}

describe('job flows', () => {
  let app: INestApplication<App>;
  let flows: JobFlowsService;
  let handlers: JobFlowHandlers;
  let admin: TestUser;
  let tenantId: string;
  let worker: Worker;
  let workerConnection: IORedis;
  const flowOptions = () => ({ tenantId, queue: SPEC_QUEUE });

  beforeAll(async () => {
    app = await boot();
    flows = app.get(JobFlowsService);
    handlers = app.get(JobFlowHandlers);

    admin = await registerAndLogin(app);
    await becomeAdmin(admin);
    const row = await authPrismaClient.user.findUniqueOrThrow({
      where: { id: admin.id },
    });
    tenantId = row.tenantId;

    workerConnection = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
    });
    worker = serve(app.get(JobFlowProcessor), workerConnection);
  });

  afterAll(async () => {
    await worker.close();
    workerConnection.disconnect();
    await app.close();
  });

  it('runs a chain in order and hands each step what the one before returned', async () => {
    const name = `chain-${randomUUID()}`;
    const seen: unknown[] = [];

    handlers.register(`${name}.first`, () => 1);
    handlers.register(`${name}.second`, ({ previous }) => {
      seen.push(previous);
      return Number(previous) + 1;
    });
    handlers.register(`${name}.third`, ({ previous, tenantId: scope }) => {
      seen.push(previous, scope);
    });

    const started = await flows.chain(
      {
        name,
        steps: [
          { name: `${name}.first` },
          { name: `${name}.second` },
          { name: `${name}.third` },
        ],
      },
      flowOptions(),
    );

    expect(started.steps.map((step) => step.name)).toEqual([
      `${name}.first`,
      `${name}.second`,
      `${name}.third`,
    ]);

    const done = await waitForState(flows, tenantId, started.id, 'completed');

    expect(done.progress).toEqual({ completed: 3, total: 3 });
    expect(seen).toEqual([1, 2, tenantId]);
  });

  it('resumes a failed step without running the finished ones again', async () => {
    const name = `resume-${randomUUID()}`;
    const calls = { first: 0, second: 0, third: 0 };
    let secondShouldFail = true;

    handlers.register(`${name}.first`, () => {
      calls.first += 1;
    });
    handlers.register(`${name}.second`, () => {
      calls.second += 1;

      if (secondShouldFail) {
        throw new Error('the provider is down');
      }
    });
    handlers.register(`${name}.third`, () => {
      calls.third += 1;
    });

    const started = await flows.chain(
      {
        name,
        steps: [
          { name: `${name}.first` },
          { name: `${name}.second`, policy: FAST_RETRY },
          { name: `${name}.third` },
        ],
      },
      flowOptions(),
    );

    const failed = await waitForState(flows, tenantId, started.id, 'failed');

    expect(failed.steps.map((step) => step.state)).toEqual([
      'completed',
      'failed',
      'waiting-children',
    ]);
    expect(failed.steps[1]?.failedReason).toBe('the provider is down');
    expect(calls).toEqual({ first: 1, second: 1, third: 0 });

    secondShouldFail = false;
    await flows.retry(tenantId, started.id);

    const done = await waitForState(flows, tenantId, started.id, 'completed');

    expect(done.progress).toEqual({ completed: 3, total: 3 });
    expect(calls).toEqual({ first: 1, second: 2, third: 1 });
  });

  it('refuses a retry when nothing failed', async () => {
    const name = `idle-${randomUUID()}`;
    handlers.register(`${name}.only`, () => undefined);

    const started = await flows.chain(
      { name, steps: [{ name: `${name}.only` }] },
      flowOptions(),
    );
    await waitForState(flows, tenantId, started.id, 'completed');

    await expect(flows.retry(tenantId, started.id)).rejects.toMatchObject({
      key: 'jobFlow.nothingToRetry',
    });
  });

  it('counts progress across a batch and runs the callback once with every result', async () => {
    const name = `batch-${randomUUID()}`;
    const callbackResults: unknown[][] = [];

    handlers.register(`${name}.part`, ({ data }) => Number(data.n) * 10);
    handlers.register(`${name}.finish`, ({ results }) => {
      callbackResults.push(results);
    });

    const started = await flows.batch(
      {
        name,
        jobs: [1, 2, 3].map((n) => ({ name: `${name}.part`, data: { n } })),
        onComplete: { name: `${name}.finish` },
      },
      flowOptions(),
    );

    expect(started.progress.total).toBe(4);

    const done = await waitForState(flows, tenantId, started.id, 'completed');

    expect(done.progress).toEqual({ completed: 4, total: 4 });
    expect(callbackResults).toHaveLength(1);
    expect(
      [...(callbackResults[0] ?? [])].sort(
        (left, right) => Number(left) - Number(right),
      ),
    ).toEqual([10, 20, 30]);
  });

  it('keeps the callback waiting while one job of a batch has failed', async () => {
    const name = `partial-${randomUUID()}`;
    let broken = true;
    const finished: boolean[] = [];

    handlers.register(`${name}.part`, ({ data }) => {
      if (data.n === 2 && broken) {
        throw new Error('bad row');
      }
    });
    handlers.register(`${name}.finish`, () => {
      finished.push(true);
    });

    const started = await flows.batch(
      {
        name,
        jobs: [1, 2].map((n) => ({
          name: `${name}.part`,
          data: { n },
          policy: FAST_RETRY,
        })),
        onComplete: { name: `${name}.finish` },
      },
      flowOptions(),
    );

    const failed = await waitForState(flows, tenantId, started.id, 'failed');

    expect(failed.progress).toEqual({ completed: 1, total: 3 });
    expect(finished).toHaveLength(0);

    broken = false;
    await flows.retry(tenantId, started.id);
    await waitForState(flows, tenantId, started.id, 'completed');

    expect(finished).toHaveLength(1);
  });

  it('fails a step nobody handles instead of completing it', async () => {
    const name = `orphan-${randomUUID()}`;

    const started = await flows.chain(
      { name, steps: [{ name: `${name}.unhandled`, policy: FAST_RETRY }] },
      flowOptions(),
    );
    const failed = await waitForState(flows, tenantId, started.id, 'failed');

    expect(failed.steps[0]?.failedReason).toContain('No flow step handler');
  });

  it('rejects a flow with nothing to run', async () => {
    await expect(
      flows.chain({ name: 'empty', steps: [] }, { tenantId }),
    ).rejects.toMatchObject({ key: 'jobFlow.empty' });
  });

  describe('across a worker restart', () => {
    it('finishes a chain after the worker that was serving it stopped', async () => {
      const name = `restart-${randomUUID()}`;
      const order: string[] = [];
      const queue = app.get<Queue>(getQueueToken(SPEC_QUEUE));
      const processor = app.get(JobFlowProcessor);

      handlers.register(`${name}.a`, () => {
        order.push('a');
        return 'from-a';
      });
      handlers.register(`${name}.b`, ({ previous }) => {
        order.push(`b:${String(previous)}`);
      });

      // Paused in Redis, so the steps sit in the queue while the worker that
      // would have run them is shut down.
      await queue.pause();

      const started = await flows.chain(
        { name, steps: [{ name: `${name}.a` }, { name: `${name}.b` }] },
        flowOptions(),
      );

      await worker.close();

      // The new worker stays up for the rest of the file: the one that served
      // the earlier tests is gone, and the routes below still need a worker.
      worker = serve(processor, workerConnection);

      await queue.resume();

      const done = await waitForState(flows, tenantId, started.id, 'completed');

      expect(done.progress).toEqual({ completed: 2, total: 2 });
      expect(order).toEqual(['a', 'b:from-a']);
    });
  });

  describe('operator routes', () => {
    it('refuses a caller that is not an admin', async () => {
      const member = await registerAndLogin(app);

      await request(app.getHttpServer())
        .get('/job-flows')
        .set('Authorization', `Bearer ${member.token}`)
        .expect(403);

      await request(app.getHttpServer())
        .post('/job-flows/anything/retry')
        .set('Authorization', `Bearer ${member.token}`)
        .expect(403);
    });

    it('lists, shows, retries and cancels a flow', async () => {
      const name = `ops-${randomUUID()}`;
      let broken = true;

      handlers.register(`${name}.step`, () => {
        if (broken) {
          throw new Error('boom');
        }
      });
      handlers.register(`${name}.after`, () => undefined);

      const started = await flows.chain(
        {
          name,
          steps: [
            { name: `${name}.step`, policy: FAST_RETRY },
            { name: `${name}.after` },
          ],
        },
        flowOptions(),
      );
      await waitForState(flows, tenantId, started.id, 'failed');

      const listed = await request(app.getHttpServer())
        .get('/job-flows?limit=10')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);
      const rows = (listed.body as { data: FlowDetail[] }).data;

      expect(rows.find((row) => row.id === started.id)).toMatchObject({
        name,
        state: 'failed',
        progress: { completed: 0, total: 2 },
      });

      const shown = await request(app.getHttpServer())
        .get(`/job-flows/${started.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect((shown.body as { data: FlowDetail }).data.steps).toHaveLength(2);

      broken = false;

      const retried = await request(app.getHttpServer())
        .post(`/job-flows/${started.id}/retry`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(201);

      expect((retried.body as { data: FlowDetail }).data.id).toBe(started.id);
      await waitForState(flows, tenantId, started.id, 'completed');

      await request(app.getHttpServer())
        .post(`/job-flows/${started.id}/cancel`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(409);
    });

    it('cancels a flow that has not run yet', async () => {
      const name = `cancel-${randomUUID()}`;
      const queue = app.get<Queue>(getQueueToken(SPEC_QUEUE));
      const ran: string[] = [];

      handlers.register(`${name}.step`, () => {
        ran.push('step');
      });

      await queue.pause();

      try {
        const started = await flows.chain(
          { name, steps: [{ name: `${name}.step` }] },
          flowOptions(),
        );

        const cancelled = await request(app.getHttpServer())
          .post(`/job-flows/${started.id}/cancel`)
          .set('Authorization', `Bearer ${admin.token}`)
          .expect(201);

        expect((cancelled.body as { data: FlowDetail }).data.state).toBe(
          'cancelled',
        );
      } finally {
        await queue.resume();
      }

      await waitFor(
        async () => {
          const counts = await queue.getJobCounts(
            'active',
            'waiting',
            'delayed',
            'prioritized',
            'waiting-children',
          );

          return Object.values(counts).every((count) => count === 0);
        },
        { description: 'the resumed queue to settle' },
      );

      expect(ran).toEqual([]);
    });

    it('starts a defined flow by name and rejects an unknown one', async () => {
      const name = `defined-${randomUUID()}`;
      const inputs: unknown[] = [];

      handlers.register(`${name}.run`, ({ data }) => {
        inputs.push(data.report);
      });
      flows.define(
        name,
        (input) => ({
          kind: 'chain',
          name,
          steps: [
            {
              name: `${name}.run`,
              queue: SPEC_QUEUE,
              data: { report: input.report },
            },
          ],
        }),
        'Build one report',
      );

      const definitions = await request(app.getHttpServer())
        .get('/job-flows/definitions')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(
        (definitions.body as { data: { name: string }[] }).data.map(
          (definition) => definition.name,
        ),
      ).toContain(name);

      const started = await request(app.getHttpServer())
        .post(`/job-flows/definitions/${name}/start`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ input: { report: 'monthly' } })
        .expect(201);

      await waitForState(
        flows,
        tenantId,
        (started.body as { data: FlowDetail }).data.id,
        'completed',
      );

      expect(inputs).toEqual(['monthly']);

      await request(app.getHttpServer())
        .post('/job-flows/definitions/nope/start')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({})
        .expect(404);
    });

    it("answers 404 for another tenant's flow", async () => {
      const name = `foreign-${randomUUID()}`;
      handlers.register(`${name}.step`, () => undefined);

      const started = await flows.chain(
        { name, steps: [{ name: `${name}.step` }] },
        { tenantId: `other-${randomUUID()}`, queue: SPEC_QUEUE },
      );

      await request(app.getHttpServer())
        .get(`/job-flows/${started.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(404);

      await request(app.getHttpServer())
        .post(`/job-flows/${started.id}/retry`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(404);
    });
  });
});
