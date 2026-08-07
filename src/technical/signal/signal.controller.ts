import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import IORedis from 'ioredis';
import { SessionGuard } from '#technical/auth/session.guard';
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { Capability } from '#technical/capabilities/capability.decorator';
import { PublicRoute } from '#technical/capabilities/public-route.decorator';
import { env } from '#technical/config/env';
import { ok } from '#technical/http/envelope';
import { UnpaginatedRoute } from '#technical/http/unpaginated-route.decorator';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { CHANNEL_PREFIX } from './signal.service';
import { canIssueSignalToken } from './signal.policy';
import { SignalTokenGuard } from './signal-token.guard';
import type { RequestWithSignalToken } from './signal-token.guard';
import { SignalTokenService } from './signal-token.service';

@Controller('signal')
export class SignalController {
  constructor(private readonly tokens: SignalTokenService) {}

  @Post('token')
  @UseGuards(SessionGuard, CapabilitiesGuard)
  @Capability(canIssueSignalToken)
  issueToken() {
    const tenantId = TenantContextStorage.getTenantId();
    return ok({ token: this.tokens.issue(tenantId) });
  }

  @UnpaginatedRoute('an open SSE stream: it has no end to page to')
  @Get('stream')
  @UseGuards(SignalTokenGuard)
  @PublicRoute(
    'SSE: the short-lived signal token in the query string is the credential',
  )
  stream(
    @Req() req: RequestWithSignalToken,
    @Query('channels') channels: string | undefined,
    @Res() res: Response,
  ) {
    // The tenant comes from the verified token, never from the request: a
    // caller chooses which of its own channels to listen to, never whose.
    const { tenantId } = req.signalToken;
    const requested = (channels ?? '')
      .split(',')
      .map((channel) => channel.trim())
      .filter(Boolean)
      .map((channel) => `${CHANNEL_PREFIX}${tenantId}:${channel}`);

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
