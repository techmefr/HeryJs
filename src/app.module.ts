import { Module } from '@nestjs/common';
import { HeryModule } from '@heryjs/core/app';
import { heryConfig } from '@heryjs/core/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [HeryModule.forRoot(heryConfig)],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
