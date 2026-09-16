import { Module } from '@nestjs/common';
import { DriverResolver } from './driver-resolver';

@Module({
  providers: [DriverResolver],
  exports: [DriverResolver],
})
export class DriversModule {}
