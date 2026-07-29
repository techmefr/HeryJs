import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { env } from './technical/config/env';
import { mountBullBoard } from './technical/jobs/bull-board';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  if (process.env.NODE_ENV !== 'production') {
    mountBullBoard(app);
  }

  await app.listen(env.PORT);
}
void bootstrap();
