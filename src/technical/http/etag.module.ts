import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { EtagInterceptor } from './etag.interceptor';

@Module({
  providers: [{ provide: APP_INTERCEPTOR, useClass: EtagInterceptor }],
})
export class EtagModule {}
