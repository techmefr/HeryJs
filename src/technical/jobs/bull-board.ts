import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import type { INestApplication } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '#technical/config/env';
import { DEFAULT_QUEUE, WEBHOOK_QUEUE } from './jobs.constants';

export function mountBullBoard(app: INestApplication) {
  const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const queues = [DEFAULT_QUEUE, WEBHOOK_QUEUE].map(
    (name) => new Queue(name, { connection }),
  );

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/jobs');
  createBullBoard({
    queues: queues.map((queue) => new BullMQAdapter(queue)),
    serverAdapter,
  });

  app.use('/jobs', serverAdapter.getRouter());
}
