import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { DEFAULT_QUEUE } from './jobs.constants';

@Injectable()
export class JobsService {
  constructor(@InjectQueue(DEFAULT_QUEUE) private readonly queue: Queue) {}

  dispatch(name: string, data: Record<string, unknown> = {}) {
    return this.queue.add(name, data);
  }
}
