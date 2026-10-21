import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { HealthRegistry } from '#technical/health/health-registry';
import { DEFAULT_QUEUE } from './jobs.constants';

@Injectable()
export class QueueHealthCheck implements OnModuleInit {
  constructor(
    private readonly registry: HealthRegistry,
    @InjectQueue(DEFAULT_QUEUE) private readonly queue: Queue,
  ) {}

  onModuleInit(): void {
    this.registry.register({
      name: 'queue',
      probes: ['readiness'],
      check: async () => {
        await this.queue.getJobCounts('waiting');
      },
    });
  }
}
