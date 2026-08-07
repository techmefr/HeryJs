import '#technical/config/load-env';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from '#app.module';
import { env } from '#technical/config/env';
import { loadCorsConfig, resolveCorsOptions } from '#technical/http/cors';
import { mountBullBoard } from '#technical/jobs/bull-board';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  const logger = app.get(Logger);
  app.useLogger(logger);

  // Which browsers may call this API is declared in cors.config.ts, in every
  // environment: it used to be "everything, in development only", which is two
  // decisions taken silently -- a deployment got no cross-origin access at all
  // and nothing said so.
  const cors = resolveCorsOptions(loadCorsConfig(), process.env.NODE_ENV);

  if (cors === false) {
    logger.log(
      'CORS is off: cors.config.ts declares no origin, so no cross-origin browser can read a response from this API.',
    );
  } else {
    app.enableCors(cors);
  }

  if (process.env.NODE_ENV !== 'production') {
    mountBullBoard(app);
  }

  await app.listen(env.PORT);
}
void bootstrap();
