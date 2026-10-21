export const OUTBOX_RELAY_JOB = 'outbox.relay';
export const OUTBOX_RELAY_SCHEDULER_ID = 'outbox-relay';
export const OUTBOX_RELAY_LOCK = 'outbox:relay';

export const OUTBOX_STATUS_PENDING = 'pending';
export const OUTBOX_STATUS_DELIVERED = 'delivered';
export const OUTBOX_STATUS_DEAD = 'dead';

export const OUTBOX_BATCH_SIZE = 50;
export const OUTBOX_MAX_ATTEMPTS = 8;
export const OUTBOX_BACKOFF_BASE_MS = 2_000;
export const OUTBOX_BACKOFF_CAP_MS = 15 * 60_000;
export const OUTBOX_ERROR_MAX_LENGTH = 2_000;

export const OUTBOX_DELIVERED_RETENTION_DAYS = 7;
export const OUTBOX_DEAD_RETENTION_DAYS = 30;

export const OUTBOX_EVENT_NAME_PREFIX = 'event:';
export const OUTBOX_MODEL_NAME_PREFIX = 'model.';

export const OUTBOX_EXCLUDED_MODELS: ReadonlySet<string> = new Set([
  'AppNotification',
]);
