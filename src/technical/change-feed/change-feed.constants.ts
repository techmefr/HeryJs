export const CHANGE_FEED_HANDLER_NAME = 'change-feed';
export const CHANGE_FEED_OUTBOX_PATTERN = 'model.*';

export const CHANGE_FEED_TOPIC_PREFIX = 'change-feed:';
export const CHANGE_FEED_PRESENCE_PREFIX = 'change-feed:presence:';

export const CHANGE_FEED_MAX_CHANNELS = 20;
export const CHANGE_FEED_MAX_STATE_BYTES = 1_024;
export const CHANGE_FEED_MAX_BROADCAST_BYTES = 4_096;
export const CHANGE_FEED_EVENT_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_.:-]{0,63}$/;

export const CHANGE_FEED_PRESENCE_TTL_MS = 90_000;
export const CHANGE_FEED_PRESENCE_REFRESH_MS = 30_000;
export const CHANGE_FEED_PRESENCE_KEY_TTL_SECONDS = 3_600;

export const CHANGE_FEED_TOKEN_TTL_SECONDS = 60;
export const CHANGE_FEED_TOKEN_DOMAIN = 'change-feed.';
