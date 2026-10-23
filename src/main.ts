import '#technical/config/load-env';
import { Logger } from 'nestjs-pino';
import { AppModule } from '#app.module';
import { createApp } from './create-app';
import {
  devEnvironmentsOf,
  isDevEnvironment,
  sharedDevEnvironmentWarning,
} from '#technical/config/dev-environments';
import { env } from '#technical/config/env';
import { heryConfig } from '#technical/config/hery-config';
import {
  loadCorsConfig,
  resolveCorsOptions,
  withOriginsFromEnv,
} from '#technical/http/cors';
import { mountBullBoard } from '#technical/jobs/bull-board';
import { startTelemetry } from '#technical/telemetry/start-telemetry';

async function bootstrap() {
  await startTelemetry();

  const app = await createApp(AppModule);

  const logger = app.get(Logger);
  app.useLogger(logger);

  const devEnvironments = devEnvironmentsOf(heryConfig);
  const devWarning = sharedDevEnvironmentWarning(
    process.env.NODE_ENV,
    devEnvironments,
  );

  if (devWarning) {
    logger.warn(devWarning);
  }

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

  if (isDevEnvironment(process.env.NODE_ENV, devEnvironments)) {
    mountBullBoard(app);
  }

  await app.listen(env.PORT);
}
void bootstrap();
