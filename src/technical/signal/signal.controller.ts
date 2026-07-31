import { Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import IORedis from 'ioredis';
import { SessionGuard } from '#technical/auth/session.guard';
import { env } from '#technical/config/env';
import { ok } from '#technical/http/envelope';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { CHANNEL_PREFIX } from './signal.service';
import { SignalTokenService } from './signal-token.service';

@Controller('signal')
export class SignalController {
  constructor(private readonly tokens: SignalTokenService) {}

  @Post('token')
  @UseGuards(SessionGuard)
  issueToken() {
    const tenantId = TenantContextStorage.getTenantId();
    return ok({ token: this.tokens.issue(tenantId) });
  }

  @Get('stream')
  stream(
    @Query('token') token: string | undefined,
    @Query('channels') channels: string | undefined,
    @Res() res: Response,
  ) {
    const payload = this.tokens.verify(token ?? '');

    if (!payload) {
      res.status(401).end();
      return;
    }

    const requested = (channels ?? '')
      .split(',')
      .map((channel) => channel.trim())
      .filter(Boolean)
      .map((channel) => `${CHANNEL_PREFIX}${payload.tenantId}:${channel}`);

    if (requested.length === 0) {
      res.status(400).end();
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(': connected\n\n');

    const subscriber = new IORedis(env.REDIS_URL);

    void subscriber.subscribe(...requested);

    subscriber.on('message', (_channel, message) => {
      res.write(`event: signal\ndata: ${message}\n\n`);
    });

    res.req.on('close', () => {
      void subscriber.quit();
    });
  }
}
