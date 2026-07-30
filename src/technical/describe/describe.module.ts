import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { DescribeController } from './describe.controller';
import { DescribeService } from './describe.service';

@Module({
  imports: [DiscoveryModule, AuthModule],
  controllers: [DescribeController],
  providers: [DescribeService],
})
export class DescribeModule {}
