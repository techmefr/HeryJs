import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { runInTenant } from '#technical/tenancy/run-in-tenant';
import { ScheduledTaskStore } from '#technical/scheduler/scheduled-task.store';
import { isAllowedHere } from './exposition-environment';
import { ExpositionRegistry } from './exposition.registry';
import { ExpositionRunner } from './exposition-runner.service';
import type { ExposedCronTrigger, RegisteredAction } from './exposition.types';

export function cronJobName(actionName: string): string {
  return `expose:${actionName}`;
}

/**
 * A cron trigger is the operator's own declaration in code, so it runs trusted,
 * exactly like the CLI: there is no caller to check a capability against. It
 * goes through ScheduledTaskStore, which is what makes it single-fire across a
 * cluster and visible in the scheduler status, and it runs with every param at
 * its declared default, because nobody is there to supply one.
 */
@Injectable()
export class ExpositionCronService implements OnApplicationBootstrap {
  private readonly logger = new Logger('ExpositionCron');

  constructor(
    private readonly registry: ExpositionRegistry,
    private readonly runner: ExpositionRunner,
    private readonly store: ScheduledTaskStore,
    private readonly schedules: SchedulerRegistry,
  ) {}

  onApplicationBootstrap(): void {
    for (const action of this.registry.all()) {
      if (!action.triggers?.cron) continue;

      if (!isAllowedHere(action)) {
        this.logger.log(
          `Not scheduling ${action.name}: it is not allowed in this environment.`,
        );
        continue;
      }

      this.schedule(action, action.triggers.cron);
    }
  }

  private schedule(
    action: RegisteredAction,
    trigger: ExposedCronTrigger,
  ): void {
    const name = cronJobName(action.name);
    const { expression, tenantId } = trigger;

    const job = new CronJob(expression, () =>
      this.store.run(name, async () => {
        await runInTenant(tenantId, () =>
          this.runner.runTrusted(action.name, {}),
        );
      }),
    );

    this.schedules.addCronJob(name, job);
    job.start();
  }
}
