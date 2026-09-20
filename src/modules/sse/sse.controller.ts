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
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { Capability } from '#technical/capabilities/capability.decorator';
import { PublicRoute } from '#technical/capabilities/public-route.decorator';
import { RateLimit } from '#technical/rate-limit/rate-limit.decorator';
import { UnpaginatedRoute } from '#technical/http/unpaginated-route.decorator';
import { SessionGuard } from '#technical/auth/session.guard';
import type { RequestWithUser } from '#technical/auth/session.guard';
import { ok } from '#technical/http/envelope';
import { SseTokenGuard } from './sse-token.guard';
import type { RequestWithSseToken } from './sse-token.guard';
import { SseTokenService } from './sse-token.service';
import { SseStreamService } from './sse-stream.service';
import { canIssueSseToken } from './sse.policy';

const KEEPALIVE_MS = 25000;

function channelsFrom(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((channel) => channel.trim())
    .filter(Boolean);
}

@Controller('sse')
export class SseController {
  constructor(
    private readonly tokens: SseTokenService,
    private readonly streams: SseStreamService,
  ) {}

  @RateLimit('write')
  @Post('token')
  @UseGuards(SessionGuard, CapabilitiesGuard)
  @Capability(canIssueSseToken)
  issueToken(@Req() req: RequestWithUser) {
    return ok({ token: this.tokens.issue(req.user.tenantId) });
  }

  @UnpaginatedRoute('an open SSE stream: it has no end to page to')
  @RateLimit('read')
  @Get('stream')
  @UseGuards(SseTokenGuard)
  @PublicRoute(
    'SSE: the short-lived SSE token in the query string is the credential',
  )
  async stream(
    @Req() req: RequestWithSseToken,
    @Query('channels') channelsParam: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    // The tenant comes from the verified token, never from the request: a
    // caller chooses which of its own channels to listen to, never whose.
    const { tenantId } = req.sseToken;
    const channels = channelsFrom(channelsParam);

    if (channels.length === 0) {
      res.status(400).end();
      return;
    }

    // The spec's own header, sent automatically by every EventSource
    // reconnecting after a drop -- no client-side code writes it.
    const lastEventId =
      req.header('last-event-id') ??
      (req.query as { lastEventId?: string }).lastEventId;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(': connected\n\n');

    const subscriptions = await Promise.all(
      channels.map((channel) =>
        this.attach(res, tenantId, channel, lastEventId),
      ),
    );

    const heartbeat = setInterval(() => res.write(':\n\n'), KEEPALIVE_MS);

    res.req.on('close', () => {
      clearInterval(heartbeat);
      void Promise.all(subscriptions.map((subscription) => subscription.stop()));
    });
  }

  /**
   * One channel's half of the stream: replay what the backlog still holds
   * after `lastEventId`, then continue from the last id replayed (or `$`,
   * "only what comes next", for a first connection) so live delivery resumes
   * from precisely where replay stopped -- never from "now," which is where
   * a gap could otherwise open between the two.
   */
  private async attach(
    res: Response,
    tenantId: string,
    channel: string,
    lastEventId: string | undefined,
  ) {
    let resumeFrom = '$';

    if (lastEventId !== undefined) {
      const replayable = await this.streams.canReplay(
        tenantId,
        channel,
        lastEventId,
      );

      if (!replayable) {
        this.write(res, channel, 'sse-stale-connection', { channel });
      } else {
        const missed = await this.streams.replaySince(
          tenantId,
          channel,
          lastEventId,
        );

        for (const entry of missed) {
          this.write(res, channel, entry.event, entry.payload, entry.id);
        }

        resumeFrom = missed[missed.length - 1]?.id ?? resumeFrom;
      }
    }

    return this.streams.subscribeLive(tenantId, channel, resumeFrom, (entry) =>
      this.write(res, channel, entry.event, entry.payload, entry.id),
    );
  }

  private write(
    res: Response,
    channel: string,
    event: string,
    payload: Record<string, unknown>,
    id?: string,
  ): void {
    const lines = [
      ...(id !== undefined ? [`id: ${id}`] : []),
      `event: ${event}`,
      `data: ${JSON.stringify({ channel, ...payload })}`,
      '',
      '',
    ];

    res.write(lines.join('\n'));
  }
}
