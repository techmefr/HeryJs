import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import type { INestApplication } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { NextFunction, Request, Response } from 'express';
import IORedis from 'ioredis';
import { AUTH_PROVIDER } from '#technical/auth/auth.types';
import type { AuthProvider } from '#technical/auth/auth.types';
import { resolveCallerOnce } from '#technical/auth/resolve-caller';
import { isPlatformOperator } from '#technical/capabilities/ability';
import { env } from '#technical/config/env';
import { DEFAULT_QUEUE, FLOW_QUEUE, WEBHOOK_QUEUE } from './jobs.constants';

export const BULL_BOARD_BASE_PATH = '/jobs';

/**
 * Bull Board reads, retries and removes the jobs of every tenant, so only the
 * platform operator (PLATFORM_OPERATOR_IDS) may open it, whatever the
 * environment. Anyone else is told it is not here.
 */
export function operatorOnly(provider: AuthProvider) {
  return async (request: Request, response: Response, next: NextFunction) => {
    const header = request.header('authorization');
    const token = header?.startsWith('Bearer ')
      ? header.slice('Bearer '.length)
      : undefined;
    const caller = token
      ? await resolveCallerOnce(provider, token, request)
      : null;

    if (!isPlatformOperator(caller?.id)) {
      response.status(404).end();
      return;
    }

    next();
  };
}

export function mountBullBoard(app: INestApplication) {
  const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const queues = [DEFAULT_QUEUE, WEBHOOK_QUEUE, FLOW_QUEUE].map(
    (name) => new Queue(name, { connection }),
  );

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(BULL_BOARD_BASE_PATH);
  createBullBoard({
    queues: queues.map((queue) => new BullMQAdapter(queue)),
    serverAdapter,
  });

  app.use(
    BULL_BOARD_BASE_PATH,
    operatorOnly(app.get<AuthProvider>(AUTH_PROVIDER)),
    serverAdapter.getRouter(),
  );
}
