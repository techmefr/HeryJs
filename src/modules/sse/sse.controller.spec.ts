import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import { SseController } from './sse.controller';
import { SseStreamService } from './sse-stream.service';
import { SseTokenService } from './sse-token.service';
import type { RequestWithSseToken } from './sse-token.guard';

function fakeResponse() {
  const req = new EventEmitter() as unknown as Request;
  const chunks: string[] = [];
  const written = new EventEmitter();
  const res = {
    req,
    writeHead: () => res,
    write: (chunk: string) => {
      chunks.push(chunk);
      written.emit('chunk');
      return true;
    },
    status: () => res,
    end: () => undefined,
  } as unknown as Response;
  const received = (text: string) =>
    new Promise<void>((resolve) => {
      const check = () => {
        if (chunks.join('').includes(text)) {
          written.off('chunk', check);
          resolve();
        }
      };

      written.on('chunk', check);
      check();
    });

  return { res, req, chunks, received };
}

function fakeRequest(
  tenantId: string,
  query: Record<string, string> = {},
  lastEventId?: string,
): RequestWithSseToken {
  return {
    sseToken: { tenantId, exp: Date.now() + 60_000 },
    query,
    header: (name: string) =>
      name.toLowerCase() === 'last-event-id' ? lastEventId : undefined,
  } as unknown as RequestWithSseToken;
}

describe('SseController', () => {
  const tokens = new SseTokenService();
  const stream = new SseStreamService();
  const controller = new SseController(tokens, stream);
  const tenantId = `tenant-${Date.now()}`;

  afterAll(async () => {
    await stream.onModuleDestroy();
  });

  it('mints a token scoped to the caller tenant', () => {
    const result = controller.issueToken({
      user: { tenantId },
    } as never);

    expect(tokens.verify(result.data.token)).toEqual(
      expect.objectContaining({ tenantId }),
    );
  });

  it('rejects a stream request with no channel', async () => {
    const { res } = fakeResponse();
    let statusCode: number | undefined;
    (res as unknown as { status: (code: number) => Response }).status = (
      code,
    ) => {
      statusCode = code;
      return res;
    };

    await controller.stream(fakeRequest(tenantId), undefined, res);

    expect(statusCode).toBe(400);
  });

  /**
   * The scenario the issue calls out by name: a connection drops, the
   * client reconnects with the id of the last event it saw, and it gets
   * back exactly what it missed followed by exactly what happens next --
   * once each, in order, with nothing silently skipped.
   */
  it('replays missed events on Last-Event-ID and then continues live, with no gap or duplicate', async () => {
    const channel = `orders-${Date.now()}`;
    const beforeConnect = await stream.publish(tenantId, channel, 'tick', {
      n: 1,
    });

    // Published while the client was disconnected -- this is exactly what
    // Last-Event-ID replay exists to recover.
    const missedWhileGone = await stream.publish(tenantId, channel, 'tick', {
      n: 2,
    });

    const { res, req, chunks, received } = fakeResponse();

    await controller.stream(
      fakeRequest(tenantId, { channels: channel }, beforeConnect),
      channel,
      res,
    );

    // Published after the reconnect -- this is the live tail, and it must
    // arrive without anything replayed twice or a gap in between.
    await stream.publish(tenantId, channel, 'tick', { n: 3 });

    await received('"n":3');
    req.emit('close');

    const events = chunks
      .join('')
      .split('\n\n')
      .filter((block) => block.includes('data:'))
      .map((block) => ({
        id: /^id: (.+)$/m.exec(block)?.[1],
        data: JSON.parse(/data: (.+)$/m.exec(block)?.[1] ?? '{}') as {
          n: number;
        },
      }));

    expect(events.map((e) => e.data.n)).toEqual([2, 3]);
    expect(events[0]?.id).toBe(missedWhileGone);
  });

  it('stops delivering once the connection closes', async () => {
    const channel = `stops-${Date.now()}`;
    const setupId = await stream.publish(tenantId, channel, 'setup', {
      n: 0,
    });
    // The probe below replays this one, so it tails live from a concrete id
    // rather than from "$", which would race the publish that follows.
    await stream.publish(tenantId, channel, 'setup', { n: 0 });
    const { res, req, chunks } = fakeResponse();

    await controller.stream(
      fakeRequest(tenantId, { channels: channel }),
      channel,
      res,
    );
    req.emit('close');
    const before = chunks.length;

    // A second connection still listening proves the tick was delivered to
    // every live subscriber by the time it shows up there.
    const probe = fakeResponse();
    await controller.stream(
      fakeRequest(tenantId, { channels: channel }, setupId),
      channel,
      probe.res,
    );

    await stream.publish(tenantId, channel, 'tick', { n: 1 });
    await probe.received('"n":1');
    probe.req.emit('close');

    expect(chunks.length).toBe(before);
  });
});
