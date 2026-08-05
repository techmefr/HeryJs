import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import IORedis from 'ioredis';
import { env } from '#technical/config/env';
import { DEFAULT_QUEUE, WEBHOOK_QUEUE } from './jobs.constants';
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
    // Its own queue, not a job name inside DEFAULT_QUEUE -- a shared queue
    // hands each job to whichever registered worker is idle, not to the one
    // whose job.name matches, so a MailProcessor worker can silently
    // complete a webhook job (and vice versa) without ever running it.
    BullModule.registerQueue({ name: WEBHOOK_QUEUE }),
  ],
  providers: [JobsService],
  exports: [BullModule, JobsService],
})
export class JobsModule {}
