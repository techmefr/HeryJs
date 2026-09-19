import { Inject, UseGuards } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server } from 'socket.io';
import { AUTH_PROVIDER } from '#kernel/auth/auth.types';
import type { AuthProvider } from '#kernel/auth/auth.types';
import { subjectOf } from '#kernel/capabilities/subject';
import {
  authenticateSocket,
  SocketAuthGuard,
} from '#kernel/websocket/socket-auth.guard';
import type { AuthenticatedSocket } from '#kernel/websocket/socket-auth.guard';
import { withTenant } from '#kernel/websocket/with-tenant';
import { PeerRoomPresenceService } from './peer-room-presence.service';
import { PeerTurnCredentialsService } from './peer-turn-credentials.service';
import { canJoinPeerRoom, canViewPeerRoomParticipants } from './peer.policy';

interface JoinRoomBody {
  room: string;
}

interface SignalBody {
  room: string;
  to: string;
  payload: unknown;
}

// Signalling for WebRTC, nothing else: this gateway relays offer, answer and
// ICE candidates between two clients that then negotiate a peer connection
// directly. No media ever passes through here -- there is no SFU, no
// recording, no server-side decoding, on purpose (see the peer guide).
//
// It rides the same "/peer" Socket.IO namespace and the live module's own
// SocketAuthGuard/withTenant rather than opening a second gateway or a second
// auth path: a second WebSocket server is exactly how a tenant boundary gets
// lost, per the issue this module closes.
@WebSocketGateway({ namespace: '/peer' })
@UseGuards(SocketAuthGuard)
export class PeerGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server!: Server;

  constructor(
    private readonly presence: PeerRoomPresenceService,
    private readonly turnCredentialsService: PeerTurnCredentialsService,
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProvider,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    const authenticated = await authenticateSocket(
      client,
      this.authProvider,
    );

    if (!authenticated) {
      client.disconnect(true);
    }
  }

  // The one event a peer never gets to send: a dropped connection, a closed
  // tab, a crashed process. Socket.IO's disconnect is the only signal for it,
  // so every room the presence service still has this socket in is closed
  // out here and the remaining participants are told the peer is gone --
  // otherwise they would wait forever for a "leave" that never arrives.
  handleDisconnect(client: AuthenticatedSocket) {
    const left = this.presence.disconnect(client.id);

    for (const { room, participant } of left) {
      this.server.to(room).emit('peer-left', {
        ...participant,
        reason: 'disconnected',
      });
    }
  }

  @SubscribeMessage('join-room')
  joinRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: JoinRoomBody,
  ) {
    return withTenant(client, async () => {
      const subject = subjectOf(client.data.user);
      const decision = canJoinPeerRoom(subject);
      if (!decision.allowed) {
        return { error: 'capability denied' };
      }

      const participant = { socketId: client.id, userId: client.data.user.id };
      await client.join(body.room);
      this.presence.join(body.room, participant);
      client.to(body.room).emit('peer-joined', participant);

      const viewDecision = canViewPeerRoomParticipants(subject);
      return {
        joined: body.room,
        participants: viewDecision.allowed
          ? this.presence.participantsOf(body.room)
          : [],
      };
    });
  }

  @SubscribeMessage('leave-room')
  leaveRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: JoinRoomBody,
  ) {
    const participant = this.presence.leave(body.room, client.id);
    void client.leave(body.room);

    if (participant) {
      client
        .to(body.room)
        .emit('peer-left', { ...participant, reason: 'left' });
    }

    return { left: body.room };
  }

  @SubscribeMessage('participants')
  participants(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: JoinRoomBody,
  ) {
    const subject = subjectOf(client.data.user);
    const decision = canViewPeerRoomParticipants(subject);
    if (!decision.allowed) {
      return { error: 'capability denied' };
    }

    return { participants: this.presence.participantsOf(body.room) };
  }

  // Offer, answer and ICE candidates are relayed verbatim to one target
  // socket in the room -- this gateway never inspects or stores SDP, it only
  // moves it between the two clients that go on to negotiate directly.
  @SubscribeMessage('offer')
  offer(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: SignalBody,
  ) {
    return this.relay('offer', client, body);
  }

  @SubscribeMessage('answer')
  answer(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: SignalBody,
  ) {
    return this.relay('answer', client, body);
  }

  @SubscribeMessage('ice-candidate')
  iceCandidate(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: SignalBody,
  ) {
    return this.relay('ice-candidate', client, body);
  }

  // Short-lived TURN credentials, minted per participant so a client never
  // holds one longer than the call it asked for -- see PeerTurnCredentialsService
  // for the coturn use-auth-secret HMAC that makes them unforgeable.
  @SubscribeMessage('turn-credentials')
  turnCredentials(@ConnectedSocket() client: AuthenticatedSocket) {
    return this.turnCredentialsService.mint(client.data.user.id);
  }

  private relay(
    event: 'offer' | 'answer' | 'ice-candidate',
    client: AuthenticatedSocket,
    body: SignalBody,
  ) {
    const inRoom = this.presence
      .participantsOf(body.room)
      .some((participant) => participant.socketId === client.id);

    if (!inRoom) {
      return { error: 'not in room' };
    }

    this.server.to(body.to).emit(event, {
      from: client.id,
      payload: body.payload,
    });

    return { relayed: true };
  }
}
