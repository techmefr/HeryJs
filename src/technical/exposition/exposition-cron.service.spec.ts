import type { SchedulerRegistry } from '@nestjs/schedule';
import type { CronJob } from 'cron';
import type { ScheduledTaskStore } from '#technical/scheduler/scheduled-task.store';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { ExpositionCronService } from './exposition-cron.service';
import type { ExpositionRunner } from './exposition-runner.service';
import { ExpositionRegistry } from './exposition.registry';
import type { RegisteredAction } from './exposition.types';

const allowEveryone: RegisteredAction['capability'] = () => ({
  allowed: true,
  scope: 'all',
});

function cronAction(
  name: string,
  overrides: Partial<RegisteredAction> = {},
): RegisteredAction {
  return {
    name,
    capability: allowEveryone,
    params: [],
    invoke: () => undefined,
    triggers: { cron: { expression: '0 3 * * *', tenantId: 'acme' } },
    ...overrides,
  };
}

function build(actions: RegisteredAction[]) {
  const registry = new ExpositionRegistry();
  actions.forEach((action) => registry.register(action));

  const jobs = new Map<string, CronJob>();
  const tenants: (string | null)[] = [];
  const ran: string[] = [];
  const storedAs: string[] = [];

  const runner = {
    runTrusted: (name: string) => {
      tenants.push(TenantContextStorage.findTenantId());
      ran.push(name);
      return Promise.resolve();
    },
  } as unknown as ExpositionRunner;

  const store = {
    run: async (name: string, task: () => Promise<void>) => {
      storedAs.push(name);
      await task();
    },
  } as unknown as ScheduledTaskStore;

  const schedules = {
    addCronJob: (name: string, job: CronJob) => jobs.set(name, job),
  } as unknown as SchedulerRegistry;

  const service = new ExpositionCronService(registry, runner, store, schedules);

  return { service, jobs, tenants, ran, storedAs };
}

describe('ExpositionCronService', () => {
  const started: CronJob[] = [];

  afterEach(() => {
    started.splice(0).forEach((job) => void job.stop());
  });

  it('schedules an action that declares a cron trigger and runs it trusted, in its tenant, through the scheduler store', async () => {
    const { service, jobs, tenants, ran, storedAs } = build([
      cronAction('cronfixture.nightly'),
    ]);

    service.onApplicationBootstrap();

    const job = jobs.get('expose:cronfixture.nightly');
    expect(job).toBeDefined();
    started.push(job!);
    expect(job!.isActive).toBe(true);

    await job!.fireOnTick();

    expect(ran).toEqual(['cronfixture.nightly']);
    expect(tenants).toEqual(['acme']);
    expect(storedAs).toEqual(['expose:cronfixture.nightly']);
  });

  it('leaves an action with no cron trigger alone', () => {
    const { service, jobs } = build([
      cronAction('cronfixture.manual', { triggers: { http: true } }),
    ]);

    service.onApplicationBootstrap();

    expect(jobs.size).toBe(0);
  });

  it('does not schedule an action the current environment does not allow', () => {
    const { service, jobs } = build([
      cronAction('cronfixture.prodOnly', { environments: ['production'] }),
    ]);

    service.onApplicationBootstrap();

    expect(jobs.size).toBe(0);
  });

  it('fails the boot on an invalid cron expression', () => {
    const { service } = build([
      cronAction('cronfixture.broken', {
        triggers: { cron: { expression: 'not a cron', tenantId: 'acme' } },
      }),
    ]);

    expect(() => service.onApplicationBootstrap()).toThrow();
  });
});
