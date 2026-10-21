import { Injectable, OnModuleDestroy } from '@nestjs/common';
import IORedis from 'ioredis';
import { env } from '#technical/config/env';
import {
  CHANGE_FEED_PRESENCE_KEY_TTL_SECONDS,
  CHANGE_FEED_PRESENCE_PREFIX,
  CHANGE_FEED_TOPIC_PREFIX,
} from './change-feed.constants';
import type {
  ChangeFeedBackend,
  ChangeFeedEnvelope,
  ChangeFeedPresenceMember,
} from './change-feed.types';

interface StoredMember {
  member: ChangeFeedPresenceMember;
  expiresAt: number;
}

type Listener = (envelope: ChangeFeedEnvelope) => void;

function topicOf(tenantId: string): string {
  return `${CHANGE_FEED_TOPIC_PREFIX}${tenantId}`;
}

function presenceKey(tenantId: string, channel: string): string {
  return `${CHANGE_FEED_PRESENCE_PREFIX}${tenantId}:${channel}`;
}

function parseEnvelope(raw: string): ChangeFeedEnvelope | null {
  try {
    return JSON.parse(raw) as ChangeFeedEnvelope;
  } catch {
    return null;
  }
}

function parseStored(raw: string): StoredMember | null {
  try {
    return JSON.parse(raw) as StoredMember;
  } catch {
    return null;
  }
}

@Injectable()
export class RedisChangeFeedBackend
  implements ChangeFeedBackend, OnModuleDestroy
{
  private readonly publisher = new IORedis(env.REDIS_URL);
  private subscriber: IORedis | null = null;
  private readonly listeners = new Map<string, Set<Listener>>();

  async publish(envelope: ChangeFeedEnvelope): Promise<void> {
    await this.publisher.publish(
      topicOf(envelope.tenantId),
      JSON.stringify(envelope),
    );
  }

  async subscribe(
    tenantId: string,
    listener: Listener,
  ): Promise<() => Promise<void>> {
    const client = this.connectedSubscriber();
    const tenantListeners = this.listeners.get(tenantId) ?? new Set<Listener>();
    const isFirst = tenantListeners.size === 0;

    tenantListeners.add(listener);
    this.listeners.set(tenantId, tenantListeners);

    if (isFirst) {
      await client.subscribe(topicOf(tenantId));
    }

    return async () => {
      tenantListeners.delete(listener);

      if (tenantListeners.size > 0) {
        return;
      }

      this.listeners.delete(tenantId);
      await client.unsubscribe(topicOf(tenantId));
    };
  }

  async joinPresence(
    tenantId: string,
    channel: string,
    member: ChangeFeedPresenceMember,
    ttlMs: number,
  ): Promise<void> {
    const key = presenceKey(tenantId, channel);
    const stored: StoredMember = { member, expiresAt: Date.now() + ttlMs };

    await this.publisher.hset(key, member.connectionId, JSON.stringify(stored));
    await this.publisher.expire(key, CHANGE_FEED_PRESENCE_KEY_TTL_SECONDS);
  }

  async leavePresence(
    tenantId: string,
    channel: string,
    connectionId: string,
  ): Promise<ChangeFeedPresenceMember | null> {
    const key = presenceKey(tenantId, channel);
    const raw = await this.publisher.hget(key, connectionId);

    if (raw === null) {
      return null;
    }

    await this.publisher.hdel(key, connectionId);

    return parseStored(raw)?.member ?? null;
  }

  async listPresence(
    tenantId: string,
    channel: string,
  ): Promise<ChangeFeedPresenceMember[]> {
    const key = presenceKey(tenantId, channel);
    const entries = await this.publisher.hgetall(key);
    const now = Date.now();
    const members: ChangeFeedPresenceMember[] = [];
    const stale: string[] = [];

    for (const [connectionId, raw] of Object.entries(entries)) {
      const stored = parseStored(raw);

      if (stored && stored.expiresAt > now) {
        members.push(stored.member);
      } else {
        stale.push(connectionId);
      }
    }

    if (stale.length > 0) {
      await this.publisher.hdel(key, ...stale);
    }

    return members;
  }

  async onModuleDestroy(): Promise<void> {
    this.subscriber?.disconnect();
    await this.publisher.quit();
  }

  private connectedSubscriber(): IORedis {
    if (this.subscriber) {
      return this.subscriber;
    }

    const client = new IORedis(env.REDIS_URL);

    client.on('message', (topic: string, raw: string) => {
      const envelope = parseEnvelope(raw);

      if (!envelope || topicOf(envelope.tenantId) !== topic) {
        return;
      }

      for (const listener of this.listeners.get(envelope.tenantId) ?? []) {
        listener(envelope);
      }
    });

    this.subscriber = client;

    return client;
  }
}
