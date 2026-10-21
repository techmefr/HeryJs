import { InjectQueue } from '@nestjs/bullmq';
import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Worker } from 'bullmq';
import type { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '#technical/config/env';
import { OUTBOX_QUEUE } from '#technical/jobs/jobs.constants';
import {
  OUTBOX_RELAY_JOB,
  OUTBOX_RELAY_SCHEDULER_ID,
} from './outbox.constants';
import { OutboxRelay } from './outbox.relay';

const KEPT_COMPLETED_RUNS = 10;
const KEPT_FAILED_RUNS = 100;

export const OUTBOX_RELAY_OPTIONS = Symbol('OUTBOX_RELAY_OPTIONS');

export interface OutboxRelayOptions {
  isEnabled: boolean;
  intervalMs: number;
}

export function outboxRelayOptionsFromEnv(): OutboxRelayOptions {
  return {
    isEnabled: env.OUTBOX_RELAY_ENABLED,
    intervalMs: env.OUTBOX_RELAY_INTERVAL_MS,
  };
}

@Injectable()
export class OutboxRunner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Outbox');
  private worker: Worker | null = null;
  private connection: IORedis | null = null;

  constructor(
    @InjectQueue(OUTBOX_QUEUE) private readonly queue: Queue,
    private readonly relay: OutboxRelay,
    @Inject(OUTBOX_RELAY_OPTIONS) private readonly options: OutboxRelayOptions,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.options.isEnabled) {
      return;
    }

    this.connection = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
    });
    this.worker = new Worker(
      OUTBOX_QUEUE,
      async (job) => {
        if (job.name !== OUTBOX_RELAY_JOB) {
          return;
        }

        await this.relay.drain();
      },
      { connection: this.connection, concurrency: 1 },
    );
    this.worker.on('error', (error) => {
      this.logger.error(`Outbox worker error: ${error.message}`);
    });

    await this.queue.upsertJobScheduler(
      OUTBOX_RELAY_SCHEDULER_ID,
      { every: this.options.intervalMs },
      {
        name: OUTBOX_RELAY_JOB,
        opts: {
          removeOnComplete: KEPT_COMPLETED_RUNS,
          removeOnFail: KEPT_FAILED_RUNS,
        },
      },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.connection?.quit();
  }
}
