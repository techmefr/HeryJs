import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { env } from './technical/config/env';
import { mountBullBoard } from './technical/jobs/bull-board';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  if (process.env.NODE_ENV !== 'production') {
    app.enableCors();
    mountBullBoard(app);
  }

  await app.listen(env.PORT);
}
void bootstrap();
