import '#technical/config/load-env';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from '#app.module';
import { env } from '#technical/config/env';
import {
  loadCorsConfig,
  resolveCorsOptions,
  withOriginsFromEnv,
} from '#technical/http/cors';
import { mountBullBoard } from '#technical/jobs/bull-board';
import { startTelemetry } from '#technical/telemetry/start-telemetry';

async function bootstrap() {
  const isTelemetryOn = await startTelemetry();

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  if (isTelemetryOn) {
    app.enableShutdownHooks();
  }

  const logger = app.get(Logger);
  app.useLogger(logger);

  // Which browsers may call this API is declared in cors.config.ts, in every
  // environment, and CORS_ORIGINS overrides its origins per deployment: it used
  // to be "everything, in development only", which is two decisions taken
  // silently -- a deployment got no cross-origin access at all and nothing
  // said so.
  const cors = resolveCorsOptions(
    withOriginsFromEnv(loadCorsConfig(), env.CORS_ORIGINS),
    process.env.NODE_ENV,
  );

  if (cors === false) {
    logger.log(
      'CORS is off: neither CORS_ORIGINS nor cors.config.ts declares an origin, so no cross-origin browser can read a response from this API.',
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
