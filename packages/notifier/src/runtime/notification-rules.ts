import type { NotifierChannel } from './notification';

export const NOTIFIER_CHANNELS = ['mail', 'sms', 'push', 'in-app'] as const;

export const ALL_TYPES = '*';

export const INTERRUPTIVE_CHANNELS: ReadonlySet<NotifierChannel> = new Set([
  'sms',
  'push',
]);

export const DIGEST_CHANNEL: NotifierChannel = 'mail';

export const DEFAULT_TIMEZONE = 'UTC';

export const DEFAULT_DIGEST_HOUR = 8;

export interface NotificationRule {
  channel: NotifierChannel;
  type: string;
  enabled: boolean;
  digest: boolean;
}

export interface NotificationSettings {
  timezone: string;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  digestHour: number;
}

export interface NotificationRules {
  rules: NotificationRule[];
  settings: NotificationSettings;
}

export const DEFAULT_SETTINGS: NotificationSettings = {
  timezone: DEFAULT_TIMEZONE,
  quietHoursStart: null,
  quietHoursEnd: null,
  digestHour: DEFAULT_DIGEST_HOUR,
};
