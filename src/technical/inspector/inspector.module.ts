import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InspectorController } from './inspector.controller';
import { InspectorMiddleware } from './inspector.middleware';
import { InspectorStore } from './inspector.store';

@Module({
  imports: [AuthModule],
  controllers: [InspectorController],
  providers: [InspectorStore, InspectorMiddleware],
  exports: [InspectorStore, InspectorMiddleware],
})
export class InspectorModule {}
