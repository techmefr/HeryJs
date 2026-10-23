import { INestApplication } from '@nestjs/common';
import { Queue } from 'bullmq';
import { LockService } from '@heryjs/core/platform';
import { OutboxRunner } from '@heryjs/core/jobs';
import {
  PRISMA_CLIENT,
  type TenantScopedPrismaClient,
} from '@heryjs/core/database';
import { AppModule } from './../src/app.module';
import { createApp } from './../src/create-app';

describe('graceful shutdown', () => {
  let app: INestApplication;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('runs every onModuleDestroy when the process receives SIGTERM, telemetry or not', async () => {
    const outboxDestroyed = jest.spyOn(
      OutboxRunner.prototype,
      'onModuleDestroy',
    );
    const lockDestroyed = jest.spyOn(LockService.prototype, 'onModuleDestroy');
    const queueClosed = jest.spyOn(Queue.prototype, 'close');

    app = await createApp(AppModule);
    await app.init();
    const prisma = app.get<TenantScopedPrismaClient>(PRISMA_CLIENT);
    const prismaDisconnected = jest.spyOn(prisma, '$disconnect');

    const reRaised = new Promise<void>((resolve) => {
      jest.spyOn(process, 'kill').mockImplementation(() => {
        resolve();
        return true;
      });
    });

    process.emit('SIGTERM', 'SIGTERM');
    await reRaised;

    expect(prismaDisconnected).toHaveBeenCalled();
    expect(outboxDestroyed).toHaveBeenCalled();
    expect(lockDestroyed).toHaveBeenCalled();
    expect(queueClosed).toHaveBeenCalled();
  }, 30_000);
});
