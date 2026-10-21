import type {
  CapabilityRecord,
  CapabilitySubject,
} from '#technical/capabilities/capabilities.types';
import type { PolicyCheck } from '#technical/capabilities/capability-check';
import type { ModelChangeKind } from '#technical/outbox/outbox.types';

export interface ChangeFeedSubscriber {
  tenantId: string;
  userId: string;
  subject: CapabilitySubject;
}

export interface ChangeFeedResourceDefinition<
  TRecord extends CapabilityRecord,
> {
  model: string;
  channel: string;
  canViewAny: PolicyCheck;
  canView: PolicyCheck<CapabilityRecord>;
  canBroadcast?: PolicyCheck;
  load(id: string): Promise<TRecord | null>;
  toView(record: TRecord): Record<string, unknown>;
}

export interface ChangeFeedProjection {
  view: Record<string, unknown>;
  visibility: CapabilityRecord;
}

export interface ChangeFeedResource {
  model: string;
  channel: string;
  canViewAny: PolicyCheck;
  canView: PolicyCheck<CapabilityRecord>;
  canBroadcast: PolicyCheck | null;
  project(id: string): Promise<ChangeFeedProjection | null>;
}

export interface ChangeFeedPresenceMember {
  connectionId: string;
  userId: string;
  state: Record<string, unknown>;
  joinedAt: string;
}

export interface ChangeEnvelope {
  type: 'change';
  id: string;
  tenantId: string;
  channel: string;
  model: string;
  kind: ModelChangeKind;
  recordId: string | null;
  at: string;
  changedFields: string[];
  record: Record<string, unknown> | null;
  visibility: CapabilityRecord;
}

export interface PresenceEnvelope {
  type: 'presence';
  tenantId: string;
  channel: string;
  event: 'joined' | 'left';
  member: ChangeFeedPresenceMember;
}

export interface BroadcastEnvelope {
  type: 'broadcast';
  tenantId: string;
  channel: string;
  event: string;
  payload: Record<string, unknown>;
  from: string;
  fromConnectionId: string;
}

export type ChangeFeedEnvelope =
  ChangeEnvelope | PresenceEnvelope | BroadcastEnvelope;

export interface ChangeFeedChangeMessage {
  type: 'change';
  id: string;
  channel: string;
  kind: ModelChangeKind;
  recordId: string | null;
  at: string;
  changedFields: string[];
  record: Record<string, unknown> | null;
}

export interface ChangeFeedPresenceMessage {
  type: 'presence';
  channel: string;
  event: 'joined' | 'left';
  member: ChangeFeedPresenceMember;
}

export interface ChangeFeedBroadcastMessage {
  type: 'broadcast';
  channel: string;
  event: string;
  payload: Record<string, unknown>;
  from: string;
}

export type ChangeFeedMessage =
  | ChangeFeedChangeMessage
  | ChangeFeedPresenceMessage
  | ChangeFeedBroadcastMessage;

export type ChangeFeedSink = (message: ChangeFeedMessage) => void;

export type ChangeFeedDenialReason = 'unknown-channel' | 'forbidden';

export interface ChangeFeedDenial {
  channel: string;
  reason: ChangeFeedDenialReason;
}

export interface ChangeFeedSubscribeResult {
  subscribed: string[];
  denied: ChangeFeedDenial[];
}

export type ChangeFeedActionError =
  'not-subscribed' | 'forbidden' | 'invalid-event' | 'payload-too-large';

export type ChangeFeedPresenceResult =
  | { ok: true; members: ChangeFeedPresenceMember[] }
  | { ok: false; error: ChangeFeedActionError };

export type ChangeFeedBroadcastResult =
  { ok: true } | { ok: false; error: ChangeFeedActionError };

export interface ChangeFeedBackend {
  publish(envelope: ChangeFeedEnvelope): Promise<void>;
  subscribe(
    tenantId: string,
    listener: (envelope: ChangeFeedEnvelope) => void,
  ): Promise<() => Promise<void>>;
  joinPresence(
    tenantId: string,
    channel: string,
    member: ChangeFeedPresenceMember,
    ttlMs: number,
  ): Promise<void>;
  leavePresence(
    tenantId: string,
    channel: string,
    connectionId: string,
  ): Promise<ChangeFeedPresenceMember | null>;
  listPresence(
    tenantId: string,
    channel: string,
  ): Promise<ChangeFeedPresenceMember[]>;
}

export const CHANGE_FEED_BACKEND = Symbol('CHANGE_FEED_BACKEND');
