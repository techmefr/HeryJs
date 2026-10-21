import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CHANGE_FEED_EVENT_NAME_PATTERN,
  CHANGE_FEED_MAX_BROADCAST_BYTES,
  CHANGE_FEED_MAX_CHANNELS,
  CHANGE_FEED_MAX_STATE_BYTES,
  CHANGE_FEED_PRESENCE_REFRESH_MS,
  CHANGE_FEED_PRESENCE_TTL_MS,
} from './change-feed.constants';
import { ChangeFeedRegistry } from './change-feed.registry';
import { CHANGE_FEED_BACKEND } from './change-feed.types';
import type {
  ChangeEnvelope,
  ChangeFeedBackend,
  ChangeFeedBroadcastResult,
  ChangeFeedDenial,
  ChangeFeedEnvelope,
  ChangeFeedMessage,
  ChangeFeedPresenceMember,
  ChangeFeedPresenceResult,
  ChangeFeedSink,
  ChangeFeedSubscribeResult,
  ChangeFeedSubscriber,
} from './change-feed.types';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sizeOf(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value));
}

function cleanChannels(channels: unknown): string[] {
  if (!Array.isArray(channels)) {
    return [];
  }

  const names = channels.filter(
    (channel): channel is string =>
      typeof channel === 'string' && channel !== '',
  );

  return [...new Set(names)].slice(0, CHANGE_FEED_MAX_CHANNELS);
}

export class ChangeFeedSession {
  readonly id = randomUUID();
  private readonly channels = new Set<string>();
  private readonly presenceMembers = new Map<
    string,
    ChangeFeedPresenceMember
  >();
  private readonly logger = new Logger('ChangeFeed');
  private detach: (() => Promise<void>) | null = null;
  private attaching: Promise<void> | null = null;
  private refresh: NodeJS.Timeout | null = null;
  private isClosed = false;

  constructor(
    private readonly subscriber: ChangeFeedSubscriber,
    private readonly sink: ChangeFeedSink,
    private readonly registry: ChangeFeedRegistry,
    private readonly backend: ChangeFeedBackend,
  ) {}

  async subscribe(requested: unknown): Promise<ChangeFeedSubscribeResult> {
    const subscribed: string[] = [];
    const denied: ChangeFeedDenial[] = [];

    for (const channel of cleanChannels(requested)) {
      const resource = this.registry.forChannel(channel);

      if (!resource) {
        denied.push({ channel, reason: 'unknown-channel' });
        continue;
      }

      if (!resource.canViewAny(this.subscriber.subject).allowed) {
        denied.push({ channel, reason: 'forbidden' });
        continue;
      }

      this.channels.add(channel);
      subscribed.push(channel);
    }

    if (this.channels.size > 0) {
      await this.attach();
    }

    return { subscribed, denied };
  }

  async unsubscribe(requested: unknown): Promise<string[]> {
    const removed: string[] = [];

    for (const channel of cleanChannels(requested)) {
      if (!this.channels.delete(channel)) {
        continue;
      }

      await this.leavePresence(channel);
      removed.push(channel);
    }

    if (this.channels.size === 0) {
      await this.release();
    }

    return removed;
  }

  async joinPresence(
    channel: unknown,
    state: unknown,
  ): Promise<ChangeFeedPresenceResult> {
    if (typeof channel !== 'string' || !this.channels.has(channel)) {
      return { ok: false, error: 'not-subscribed' };
    }

    const memberState = isPlainObject(state) ? state : {};

    if (sizeOf(memberState) > CHANGE_FEED_MAX_STATE_BYTES) {
      return { ok: false, error: 'payload-too-large' };
    }

    const member: ChangeFeedPresenceMember = {
      connectionId: this.id,
      userId: this.subscriber.userId,
      state: memberState,
      joinedAt: new Date().toISOString(),
    };
    const alreadyPresent = this.presenceMembers.has(channel);

    await this.backend.joinPresence(
      this.subscriber.tenantId,
      channel,
      member,
      CHANGE_FEED_PRESENCE_TTL_MS,
    );
    this.presenceMembers.set(channel, member);
    this.keepPresenceAlive();

    if (!alreadyPresent) {
      await this.backend.publish({
        type: 'presence',
        tenantId: this.subscriber.tenantId,
        channel,
        event: 'joined',
        member,
      });
    }

    return {
      ok: true,
      members: await this.backend.listPresence(
        this.subscriber.tenantId,
        channel,
      ),
    };
  }

  async leavePresence(channel: unknown): Promise<void> {
    if (typeof channel !== 'string' || !this.presenceMembers.delete(channel)) {
      return;
    }

    const member = await this.backend.leavePresence(
      this.subscriber.tenantId,
      channel,
      this.id,
    );

    if (member) {
      await this.backend.publish({
        type: 'presence',
        tenantId: this.subscriber.tenantId,
        channel,
        event: 'left',
        member,
      });
    }
  }

  async broadcast(
    channel: unknown,
    event: unknown,
    payload: unknown,
  ): Promise<ChangeFeedBroadcastResult> {
    if (typeof channel !== 'string' || !this.channels.has(channel)) {
      return { ok: false, error: 'not-subscribed' };
    }

    const resource = this.registry.forChannel(channel);

    if (
      !resource?.canBroadcast ||
      !resource.canBroadcast(this.subscriber.subject).allowed
    ) {
      return { ok: false, error: 'forbidden' };
    }

    if (
      typeof event !== 'string' ||
      !CHANGE_FEED_EVENT_NAME_PATTERN.test(event)
    ) {
      return { ok: false, error: 'invalid-event' };
    }

    const body = isPlainObject(payload) ? payload : {};

    if (sizeOf(body) > CHANGE_FEED_MAX_BROADCAST_BYTES) {
      return { ok: false, error: 'payload-too-large' };
    }

    await this.backend.publish({
      type: 'broadcast',
      tenantId: this.subscriber.tenantId,
      channel,
      event,
      payload: body,
      from: this.subscriber.userId,
      fromConnectionId: this.id,
    });

    return { ok: true };
  }

  async close(): Promise<void> {
    if (this.isClosed) {
      return;
    }

    this.isClosed = true;

    for (const channel of Array.from(this.presenceMembers.keys())) {
      await this.leavePresence(channel);
    }

    this.channels.clear();
    await this.release();
  }

  private async attach(): Promise<void> {
    if (this.detach || this.isClosed) {
      return;
    }

    this.attaching ??= this.connect();

    try {
      await this.attaching;
    } finally {
      this.attaching = null;
    }
  }

  private async connect(): Promise<void> {
    const detach = await this.backend.subscribe(
      this.subscriber.tenantId,
      (envelope) => this.receive(envelope),
    );

    if (this.isClosed) {
      await detach();
      return;
    }

    this.detach = detach;
  }

  private async release(): Promise<void> {
    if (this.refresh) {
      clearInterval(this.refresh);
      this.refresh = null;
    }

    const detach = this.detach;
    this.detach = null;

    if (detach) {
      await detach();
    }
  }

  private keepPresenceAlive(): void {
    if (this.refresh) {
      return;
    }

    this.refresh = setInterval(() => {
      for (const [joined, member] of this.presenceMembers) {
        void this.backend.joinPresence(
          this.subscriber.tenantId,
          joined,
          member,
          CHANGE_FEED_PRESENCE_TTL_MS,
        );
      }
    }, CHANGE_FEED_PRESENCE_REFRESH_MS);
    this.refresh.unref();
  }

  private deliver(message: ChangeFeedMessage): void {
    try {
      this.sink(message);
    } catch (error) {
      this.logger.warn(
        `A subscriber's connection refused a ${message.type} on ${message.channel}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private receive(envelope: ChangeFeedEnvelope): void {
    if (
      envelope.tenantId !== this.subscriber.tenantId ||
      !this.channels.has(envelope.channel)
    ) {
      return;
    }

    if (envelope.type === 'presence') {
      if (envelope.member.connectionId === this.id) {
        return;
      }

      this.deliver({
        type: 'presence',
        channel: envelope.channel,
        event: envelope.event,
        member: envelope.member,
      });
      return;
    }

    if (envelope.type === 'broadcast') {
      if (envelope.fromConnectionId === this.id) {
        return;
      }

      this.deliver({
        type: 'broadcast',
        channel: envelope.channel,
        event: envelope.event,
        payload: envelope.payload,
        from: envelope.from,
      });
      return;
    }

    this.deliverChange(envelope);
  }

  private deliverChange(envelope: ChangeEnvelope): void {
    const resource = this.registry.forChannel(envelope.channel);

    if (
      !resource ||
      !resource.canView(this.subscriber.subject, envelope.visibility).allowed
    ) {
      return;
    }

    this.deliver({
      type: 'change',
      id: envelope.id,
      channel: envelope.channel,
      kind: envelope.kind,
      recordId: envelope.recordId,
      at: envelope.at,
      changedFields: envelope.changedFields,
      record: envelope.record,
    });
  }
}

@Injectable()
export class ChangeFeedHub {
  constructor(
    private readonly registry: ChangeFeedRegistry,
    @Inject(CHANGE_FEED_BACKEND) private readonly backend: ChangeFeedBackend,
  ) {}

  open(
    subscriber: ChangeFeedSubscriber,
    sink: ChangeFeedSink,
  ): ChangeFeedSession {
    return new ChangeFeedSession(subscriber, sink, this.registry, this.backend);
  }
}
