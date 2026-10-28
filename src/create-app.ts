import { NestFactory } from '@nestjs/core';
import type { INestApplication, Type } from '@nestjs/common';
import { registeredAppInstrument } from '@heryjs/core/observability';

export async function createApp(
  module: Type<unknown>,
): Promise<INestApplication> {
  const app = await NestFactory.create(module, {
    bufferLogs: true,
    rawBody: true,
    instrument: registeredAppInstrument() ?? undefined,
  });
  app.enableShutdownHooks();
  return app;
}
