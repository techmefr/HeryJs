import { getQueueToken } from '@nestjs/bullmq';
import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { QueueEvents } from 'bullmq';
import type { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '#technical/config/env';
import {
  BILLING_QUEUE,
  DEFAULT_QUEUE,
  EVENTS_QUEUE,
  EXPORT_QUEUE,
  IMPORT_QUEUE,
  WEBHOOK_QUEUE,
} from '#technical/jobs/jobs.constants';
import { TelemetryBus } from '#technical/tracing/telemetry-bus';
import { DEV_DASHBOARD_SETTINGS } from './dev-dashboard.settings';
import type { DevDashboardSettings } from './dev-dashboard.settings';

const WATCHED_QUEUES = [
  DEFAULT_QUEUE,
  WEBHOOK_QUEUE,
  EXPORT_QUEUE,
  IMPORT_QUEUE,
  EVENTS_QUEUE,
  BILLING_QUEUE,
];

type JobOutcome = 'completed' | 'failed';

interface JobMetadata {
  name: string;
  data: unknown;
  processedOn?: number;
  finishedOn?: number;
  failedReason?: string;
}

interface JobSource {
  getJob(jobId: string): Promise<JobMetadata | undefined>;
}

function tenantOf(data: unknown): string | null {
  if (typeof data !== 'object' || data === null || !('tenantId' in data)) {
    return null;
  }

  return typeof data.tenantId === 'string' ? data.tenantId : null;
}

/**
 * Job history without touching a single processor. The queues already say when
 * a job finishes, to anyone listening, and listening here covers every
 * processor that exists or will: a worker on another instance reports the same
 * way as one in this process.
 *
 * A job's payload is read for its tenant and for nothing else -- the data is
 * not stored. A job that carries no tenant is recorded against the system
 * tenant, which no caller can read.
 */
@Injectable()
export class DevDashboardJobWatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('DevDashboard');
  private connection: IORedis | null = null;
  private watchers: QueueEvents[] = [];

  constructor(
    private readonly moduleRef: ModuleRef,
    @Inject(DEV_DASHBOARD_SETTINGS)
    private readonly settings: DevDashboardSettings,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.settings.isEnabled) {
      return;
    }

    this.connection = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
    });

    for (const name of WATCHED_QUEUES) {
      const queue = this.moduleRef.get<Queue>(getQueueToken(name), {
        strict: false,
      });
      const events = new QueueEvents(name, { connection: this.connection });

      events.on('completed', ({ jobId }) => {
        void this.record(queue, name, jobId, 'completed', null);
      });
      events.on('failed', ({ jobId, failedReason }) => {
        void this.record(queue, name, jobId, 'failed', failedReason);
      });
      events.on('error', (error) => {
        this.logger.warn(`Queue ${name} events: ${error.message}`);
      });

      this.watchers.push(events);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.watchers.map((events) => events.close()));
    this.watchers = [];
    this.connection?.disconnect();
    this.connection = null;
  }

  async record(
    queue: JobSource,
    queueName: string,
    jobId: string,
    status: JobOutcome,
    failedReason: string | null,
  ): Promise<void> {
    try {
      const job = await queue.getJob(jobId);

      if (!job) {
        return;
      }

      TelemetryBus.emit(
        {
          kind: 'job',
          queue: queueName,
          name: job.name,
          status,
          durationMs:
            job.processedOn !== undefined && job.finishedOn !== undefined
              ? job.finishedOn - job.processedOn
              : null,
          error: failedReason ?? job.failedReason ?? null,
        },
        { tenantId: tenantOf(job.data), requestId: null },
      );
    } catch (error) {
      this.logger.warn(
        `Could not read job ${jobId} on ${queueName}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }
}
