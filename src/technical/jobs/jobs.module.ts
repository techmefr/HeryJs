import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import IORedis from 'ioredis';
import { env } from '#technical/config/env';
import { DEFAULT_QUEUE } from './jobs.constants';
import { JobsService } from './jobs.service';

@Module({
  imports: [
    BullModule.forRoot({
      // Every other Redis consumer in this codebase hands the whole
      // REDIS_URL to IORedis. Pulling host/port out of the URL by hand here
      // silently dropped username, password, TLS (`rediss://`), and the
      // database index -- fine against an unauthenticated dev Redis, broken
      // the moment production has a password.
      connection: new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null }),
    }),
    BullModule.registerQueue({ name: DEFAULT_QUEUE }),
  ],
  providers: [JobsService],
  exports: [BullModule, JobsService],
})
export class JobsModule {}
