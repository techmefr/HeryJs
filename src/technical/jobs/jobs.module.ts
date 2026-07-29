import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { env } from '../config/env';
import { DEFAULT_QUEUE } from './jobs.constants';
import { JobsService } from './jobs.service';

const redisUrl = new URL(env.REDIS_URL);

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: redisUrl.hostname,
        port: Number(redisUrl.port || 6379),
        maxRetriesPerRequest: null,
      },
    }),
    BullModule.registerQueue({ name: DEFAULT_QUEUE }),
  ],
  providers: [JobsService],
  exports: [BullModule, JobsService],
})
export class JobsModule {}
