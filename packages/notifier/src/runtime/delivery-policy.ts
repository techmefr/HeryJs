import { isWithinWindow } from './local-time';
import type { NotifierChannel } from './notification';
import {
  ALL_TYPES,
  DIGEST_CHANNEL,
  INTERRUPTIVE_CHANNELS,
} from './notification-rules';
import type { NotificationRule, NotificationRules } from './notification-rules';

export type DeliveryDecision =
  | { action: 'deliver' }
  | { action: 'digest' }
  | { action: 'skip'; reason: string };

export interface DeliveryQuery {
  channel: NotifierChannel;
  type: string;
  isMandatory: boolean;
  rules: NotificationRules | null;
  now: Date;
}

function matchingRule(
  rules: NotificationRule[],
  channel: NotifierChannel,
  type: string,
): NotificationRule | null {
  const forChannel = rules.filter((rule) => rule.channel === channel);

  return (
    forChannel.find((rule) => rule.type === type) ??
    forChannel.find((rule) => rule.type === ALL_TYPES) ??
    null
  );
}

export function decideDelivery(query: DeliveryQuery): DeliveryDecision {
  if (query.isMandatory || query.rules === null) {
    return { action: 'deliver' };
  }

  const rule = matchingRule(query.rules.rules, query.channel, query.type);

  if (rule !== null && !rule.enabled) {
    return {
      action: 'skip',
      reason:
        rule.type === ALL_TYPES
          ? `Recipient opted out of ${query.channel} notifications.`
          : `Recipient opted out of ${query.type} on ${query.channel}.`,
    };
  }

  const { settings } = query.rules;
  const isQuiet = isWithinWindow(
    settings.quietHoursStart,
    settings.quietHoursEnd,
    settings.timezone,
    query.now,
  );

  if (isQuiet && INTERRUPTIVE_CHANNELS.has(query.channel)) {
    return { action: 'skip', reason: 'Recipient is in quiet hours.' };
  }

  if (query.channel === DIGEST_CHANNEL && rule?.digest === true) {
    return { action: 'digest' };
  }

  return { action: 'deliver' };
}
