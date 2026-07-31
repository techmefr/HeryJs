import { Module } from '@nestjs/common';
import { HERY_CONFIG, heryConfig } from './hery-config';

@Module({
  providers: [{ provide: HERY_CONFIG, useValue: heryConfig }],
  exports: [HERY_CONFIG],
})
export class HeryConfigModule {}
