export const AUDIT_SINK_KIND_HTTP = 'http';
export const AUDIT_SINK_KIND_STORAGE = 'storage';
export const AUDIT_SINK_KINDS = [
  AUDIT_SINK_KIND_HTTP,
  AUDIT_SINK_KIND_STORAGE,
] as const;

export type AuditSinkKind = (typeof AUDIT_SINK_KINDS)[number];

export const AUDIT_STREAM_MESSAGE = 'audit.stream';
export const AUDIT_SINK_HANDLER = 'audit-sink';
export const AUDIT_STREAM_TASK = 'audit-stream';
export const AUDIT_STREAM_LOCK = 'audit:stream';

// One outbox message covers up to this many entries, so a sink that was off
// for a day catches up in bounded steps instead of one unbounded delivery.
export const AUDIT_STREAM_BATCH_SIZE = 500;
export const AUDIT_SINK_TIMEOUT_MS = 10_000;
export const AUDIT_SINK_ERROR_MAX_LENGTH = 500;
export const AUDIT_SINK_SECRET_CONTEXT = 'AuditSink.authToken';
export const DEFAULT_STORAGE_DRIVER = 'local';
