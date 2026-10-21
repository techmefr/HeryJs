import { Injectable } from '@nestjs/common';
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

@Injectable()
export class InMemoryChangeFeedBackend implements ChangeFeedBackend {
  readonly published: ChangeFeedEnvelope[] = [];
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly presence = new Map<string, Map<string, StoredMember>>();

  publish(envelope: ChangeFeedEnvelope): Promise<void> {
    this.published.push(envelope);

    for (const listener of this.listeners.get(envelope.tenantId) ?? []) {
      listener(JSON.parse(JSON.stringify(envelope)) as ChangeFeedEnvelope);
    }

    return Promise.resolve();
  }

  subscribe(
    tenantId: string,
    listener: Listener,
  ): Promise<() => Promise<void>> {
    const tenantListeners = this.listeners.get(tenantId) ?? new Set<Listener>();
    tenantListeners.add(listener);
    this.listeners.set(tenantId, tenantListeners);

    return Promise.resolve(() => {
      tenantListeners.delete(listener);
      return Promise.resolve();
    });
  }

  listenerCount(tenantId: string): number {
    return this.listeners.get(tenantId)?.size ?? 0;
  }

  joinPresence(
    tenantId: string,
    channel: string,
    member: ChangeFeedPresenceMember,
    ttlMs: number,
  ): Promise<void> {
    const key = `${tenantId}:${channel}`;
    const members = this.presence.get(key) ?? new Map<string, StoredMember>();
    members.set(member.connectionId, {
      member,
      expiresAt: Date.now() + ttlMs,
    });
    this.presence.set(key, members);

    return Promise.resolve();
  }

  leavePresence(
    tenantId: string,
    channel: string,
    connectionId: string,
  ): Promise<ChangeFeedPresenceMember | null> {
    const members = this.presence.get(`${tenantId}:${channel}`);
    const stored = members?.get(connectionId) ?? null;
    members?.delete(connectionId);

    return Promise.resolve(stored?.member ?? null);
  }

  listPresence(
    tenantId: string,
    channel: string,
  ): Promise<ChangeFeedPresenceMember[]> {
    const members = this.presence.get(`${tenantId}:${channel}`);
    const now = Date.now();

    return Promise.resolve(
      [...(members?.values() ?? [])]
        .filter((stored) => stored.expiresAt > now)
        .map((stored) => stored.member),
    );
  }
}
