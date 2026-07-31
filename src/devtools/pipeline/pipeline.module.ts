import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from '#technical/auth/auth.module';
import { PipelineController } from './pipeline.controller';
import { PipelineInterceptor } from './pipeline.interceptor';
import { PipelineMiddleware } from './pipeline.middleware';
import { PipelineStore } from './pipeline.store';

@Module({
  imports: [AuthModule],
  controllers: [PipelineController],
  providers: [
    PipelineStore,
    PipelineMiddleware,
    { provide: APP_INTERCEPTOR, useClass: PipelineInterceptor },
  ],
  exports: [PipelineStore, PipelineMiddleware],
})
export class PipelineModule {}
