import { Inject, UseGuards } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { AUTH_PROVIDER, type AuthProvider } from '@heryjs/core/auth';
import {
  ChangeFeedHub,
  type ChangeFeedSession,
  subscriberOf,
} from '@heryjs/core/realtime';
import { authenticateLiveSocket, LiveAuthGuard } from './live-auth.guard';
import type { LiveSocket } from './live-auth.guard';

interface ChannelsBody {
  channels: unknown;
}

interface ChannelBody {
  channel: unknown;
}

interface PresenceJoinBody extends ChannelBody {
  state: unknown;
}

interface BroadcastBody extends ChannelBody {
  event: unknown;
  payload: unknown;
}

const NOT_SUBSCRIBED = { ok: false, error: 'not-subscribed' } as const;

@WebSocketGateway({ namespace: '/changes' })
@UseGuards(LiveAuthGuard)
export class ChangeFeedGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly sessions = new Map<string, ChangeFeedSession>();

  constructor(
    private readonly hub: ChangeFeedHub,
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProvider,
  ) {}

  async handleConnection(client: LiveSocket): Promise<void> {
    const authenticated = await authenticateLiveSocket(
      client,
      this.authProvider,
    );

    if (!authenticated) {
      client.disconnect(true);
      return;
    }

    this.sessions.set(
      client.id,
      this.hub.open(subscriberOf(client.data.user), (message) =>
        client.emit(message.type, message),
      ),
    );
  }

  async handleDisconnect(client: LiveSocket): Promise<void> {
    const session = this.sessions.get(client.id);
    this.sessions.delete(client.id);
    await session?.close();
  }

  @SubscribeMessage('subscribe')
  subscribe(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: ChannelsBody,
  ) {
    return (
      this.sessions.get(client.id)?.subscribe(body?.channels) ?? NOT_SUBSCRIBED
    );
  }

  @SubscribeMessage('unsubscribe')
  async unsubscribe(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: ChannelsBody,
  ) {
    const removed = await this.sessions
      .get(client.id)
      ?.unsubscribe(body?.channels);

    return { unsubscribed: removed ?? [] };
  }

  @SubscribeMessage('presence:join')
  joinPresence(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: PresenceJoinBody,
  ) {
    return (
      this.sessions.get(client.id)?.joinPresence(body?.channel, body?.state) ??
      NOT_SUBSCRIBED
    );
  }

  @SubscribeMessage('presence:leave')
  async leavePresence(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: ChannelBody,
  ) {
    await this.sessions.get(client.id)?.leavePresence(body?.channel);

    return { ok: true };
  }

  @SubscribeMessage('broadcast')
  broadcast(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: BroadcastBody,
  ) {
    return (
      this.sessions
        .get(client.id)
        ?.broadcast(body?.channel, body?.event, body?.payload) ?? NOT_SUBSCRIBED
    );
  }
}
