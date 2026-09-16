export interface MakeableContext {
  pascalName: string;
  kebabName: string;
  // Only a job needs it -- its name and its policy are module-level constants
  // -- so it is optional rather than forced on every makeable.
  screamingSnakeName?: string;
}

export function mailableFile(ctx: MakeableContext): string {
  return `import type { Mailable, MailMessage } from '#technical/mail/mail-driver';

export class ${ctx.pascalName} implements Mailable {
  constructor(readonly to: string) {}

  build(): MailMessage {
    return {
      to: this.to,
      subject: '${ctx.pascalName}',
      html: '<p>Write what ${ctx.pascalName} says here.</p>',
    };
  }
}
`;
}

export function exportableFile(ctx: MakeableContext): string {
  return `import type { Exportable, ExportRow } from '#technical/export/export-driver';

export class ${ctx.pascalName} implements Exportable {
  readonly filename = '${ctx.kebabName}';

  readonly columns: readonly string[] = ['id', 'name'];

  rows(): ExportRow[] {
    return [];
  }
}
`;
}

/**
 * A job is its processor, its name and its retry policy in one file. The
 * policy sits next to the name because that is the pair every dispatch site
 * imports, and a job written without one inherits BullMQ's defaults: a single
 * attempt, no backoff.
 */
export function jobFile(ctx: MakeableContext): string {
  return `import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { DEFAULT_QUEUE } from '#technical/jobs/jobs.constants';
import { DEFAULT_JOB_POLICY } from '#technical/jobs/job-policy';
import type { JobPolicy } from '#technical/jobs/job-policy';

export const ${ctx.screamingSnakeName}_JOB = '${ctx.kebabName}';

/**
 * Retried three times with exponential backoff. Declare RUN_ONCE_POLICY
 * instead if a second run would repeat an effect the first already had.
 */
export const ${ctx.screamingSnakeName}_POLICY: JobPolicy = DEFAULT_JOB_POLICY;

interface ${ctx.pascalName}Data {
  // The payload this job carries. It travels through Redis as plain JSON, so
  // it holds ids and values rather than instances.
  id: string;
}

// One queue per processor family: workers on a shared queue each guard on the
// job name and return, which completes another family's job without running
// it. Give this its own queue in jobs.constants.ts if it grows into a family.
@Processor(DEFAULT_QUEUE)
export class ${ctx.pascalName}Processor extends WorkerHost {
  async process(job: Job): Promise<void> {
    if (job.name !== ${ctx.screamingSnakeName}_JOB) {
      return;
    }

    const data = job.data as ${ctx.pascalName}Data;

    void data;
    await Promise.resolve();
  }
}
`;
}

/**
 * A listener reacts to an event without the dispatcher knowing it exists,
 * which is the whole point: the code that raised the event must not have to
 * import this.
 */
export function listenerFile(ctx: MakeableContext): string {
  return `import { Injectable } from '@nestjs/common';
import type { EventListener } from '#technical/events/event.types';

// Replace with the event this reacts to. The class itself is the subscription
// key, so renaming or deleting it is a compile error here rather than a
// listener that silently stops running.
class ${ctx.pascalName}Event {
  constructor(public readonly id: string) {}
}

@Injectable()
export class ${ctx.pascalName}Listener implements EventListener<${ctx.pascalName}Event> {
  /**
   * Stable across deploys: a queued job carries this name to find the listener
   * again in the worker. Renaming it while jobs are enqueued strands them.
   */
  readonly name = '${ctx.kebabName}';

  // Queued listeners run in a worker and are retried as a unit. Leave it off
  // while the work is cheap and the caller should feel its failure.
  readonly isQueued = false;

  handle(event: ${ctx.pascalName}Event): Promise<void> {
    void event;
    return Promise.resolve();
  }
}

export { ${ctx.pascalName}Event };
`;
}

/**
 * A scheduled task runs on a cron expression, and goes through
 * ScheduledTaskStore so that a run leaves a record: an unrecorded task that
 * stops firing looks exactly like one that has nothing to do.
 */
export function scheduledTaskFile(ctx: MakeableContext): string {
  return `import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ScheduledTaskStore } from '#technical/scheduler/scheduled-task.store';

@Injectable()
export class ${ctx.pascalName}Task {
  constructor(private readonly store: ScheduledTaskStore) {}

  @Cron(CronExpression.EVERY_HOUR, { name: '${ctx.kebabName}' })
  async run(): Promise<void> {
    await this.store.run('${ctx.kebabName}', async () => {
      await Promise.resolve();
    });
  }
}
`;
}
