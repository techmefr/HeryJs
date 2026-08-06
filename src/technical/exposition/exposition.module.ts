import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { AuthModule } from '#technical/auth/auth.module';
import { ExpositionController } from './exposition.controller';
import { ExpositionRegistrar } from './exposition-registrar.service';
import { ExpositionRunner } from './exposition-runner.service';
import { ExpositionRegistry } from './exposition.registry';

@Module({
  imports: [DiscoveryModule, AuthModule],
  controllers: [ExpositionController],
  providers: [ExpositionRegistry, ExpositionRegistrar, ExpositionRunner],
})
export class ExpositionModule {}
