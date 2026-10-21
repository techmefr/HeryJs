import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { OutboxModule } from '#technical/outbox/outbox.module';
import { OutputCacheAdminController } from './output-cache-admin.controller';
import { OutputCacheInterceptor } from './output-cache.interceptor';
import { OutputCacheInvalidator } from './output-cache.invalidator';
import { OutputCacheStats } from './output-cache.stats';

@Module({
  imports: [OutboxModule],
  controllers: [OutputCacheAdminController],
  providers: [
    OutputCacheStats,
    OutputCacheInvalidator,
    { provide: APP_INTERCEPTOR, useClass: OutputCacheInterceptor },
  ],
})
export class OutputCacheModule {}
