import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { LockModule } from '#technical/lock/lock.module';
import { PrismaModule } from '#technical/prisma/prisma.module';
import { IdempotencyKeyStore } from './idempotency-key.store';
import { IdempotencyInterceptor } from './idempotency.interceptor';

@Module({
  imports: [PrismaModule, LockModule],
  providers: [
    IdempotencyKeyStore,
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class IdempotencyModule {}
