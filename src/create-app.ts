import { NestFactory } from '@nestjs/core';
import type { INestApplication, Type } from '@nestjs/common';

export async function createApp(
  module: Type<unknown>,
): Promise<INestApplication> {
  const app = await NestFactory.create(module, {
    bufferLogs: true,
    rawBody: true,
  });
  app.enableShutdownHooks();
  return app;
}
