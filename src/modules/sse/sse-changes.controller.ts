import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { SessionGuard } from '#technical/auth/session.guard';
import type { RequestWithUser } from '#technical/auth/session.guard';
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { Capability } from '#technical/capabilities/capability.decorator';
import { PublicRoute } from '#technical/capabilities/public-route.decorator';
import { subscriberOf } from '#technical/change-feed/change-feed-subscriber';
import { ChangeFeedTokenService } from '#technical/change-feed/change-feed-token.service';
import { ChangeFeedHub } from '#technical/change-feed/change-feed.hub';
import type { ChangeFeedMessage } from '#technical/change-feed/change-feed.types';
import { CapabilityForbiddenException } from '#technical/errors/capability-forbidden.exception';
import { InvalidSessionException } from '#technical/errors/invalid-session.exception';
import { ok } from '#technical/http/envelope';
import { UnpaginatedRoute } from '#technical/http/unpaginated-route.decorator';
import { RateLimit } from '#technical/rate-limit/rate-limit.decorator';
import { canIssueSseToken } from './sse.policy';

const KEEPALIVE_MS = 25000;

function channelsFrom(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((channel) => channel.trim())
    .filter(Boolean);
}

function frame(event: string, data: unknown, id?: string): string {
  const lines = [
    ...(id !== undefined ? [`id: ${id}`] : []),
    `event: ${event}`,
    `data: ${JSON.stringify(data)}`,
    '',
    '',
  ];

  return lines.join('\n');
}

function frameOf(message: ChangeFeedMessage): string {
  return message.type === 'change'
    ? frame('change', message, message.id)
    : frame(message.type, message);
}

@Controller('sse/changes')
export class SseChangesController {
  constructor(
    private readonly tokens: ChangeFeedTokenService,
    private readonly hub: ChangeFeedHub,
  ) {}

  @RateLimit('write')
  @Post('token')
  @UseGuards(SessionGuard, CapabilitiesGuard)
  @Capability(canIssueSseToken)
  issueToken(@Req() req: RequestWithUser) {
    return ok({ token: this.tokens.issue(subscriberOf(req.user)) });
  }

  @UnpaginatedRoute('an open SSE stream: it has no end to page to')
  @RateLimit('read')
  @Get()
  @PublicRoute(
    'SSE: the short-lived change feed token in the query string is the credential',
  )
  async stream(
    @Req() req: Request,
    @Query('token') token: string | undefined,
    @Query('channels') channelsParam: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const subscriber = this.tokens.verify(token ?? '');

    if (!subscriber) {
      throw new InvalidSessionException();
    }

    const channels = channelsFrom(channelsParam);

    if (channels.length === 0) {
      res.status(400).end();
      return;
    }

    const pending: string[] = [];
    let isOpen = false;
    const session = this.hub.open(subscriber, (message) => {
      if (isOpen) {
        res.write(frameOf(message));
        return;
      }

      pending.push(frameOf(message));
    });
    let heartbeat: NodeJS.Timeout | null = null;

    res.req.on('close', () => {
      if (heartbeat) {
        clearInterval(heartbeat);
      }

      void session.close();
    });

    const { subscribed, denied } = await session.subscribe(channels);

    if (subscribed.length === 0) {
      await session.close();
      throw new CapabilityForbiddenException({ denied });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(': connected\n\n');
    res.write(frame('subscribed', { channels: subscribed, denied }));

    if (this.lastEventIdOf(req) !== undefined) {
      res.write(frame('resync', { channels: subscribed, reason: 'reconnect' }));
    }

    isOpen = true;
    pending.forEach((chunk) => res.write(chunk));

    heartbeat = setInterval(() => res.write(':\n\n'), KEEPALIVE_MS);
  }

  private lastEventIdOf(req: Request): string | undefined {
    return (
      req.header('last-event-id') ??
      (req.query as { lastEventId?: string }).lastEventId
    );
  }
}
