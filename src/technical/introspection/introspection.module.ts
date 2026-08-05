import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { AuthModule } from '#technical/auth/auth.module';
import { IntrospectionController } from './introspection.controller';
import { IntrospectionService } from './introspection.service';

@Module({
  imports: [DiscoveryModule, AuthModule],
  controllers: [IntrospectionController],
  providers: [IntrospectionService],
})
export class IntrospectionModule {}
