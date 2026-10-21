import { DELIVERABLE_PREFIXES } from './outbound-webhook.constants';

const WILDCARD = '*';

export function isDeliverableEvent(name: string): boolean {
  return DELIVERABLE_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/**
 * The same grammar as an outbox handler's `names`: an exact name, a trailing
 * wildcard, or `*`. `*` means every deliverable event, never every message.
 */
export function matchesEventPattern(pattern: string, name: string): boolean {
  if (!isDeliverableEvent(name)) {
    return false;
  }

  if (pattern === WILDCARD) {
    return true;
  }

  if (pattern.endsWith(WILDCARD)) {
    return name.startsWith(pattern.slice(0, -1));
  }

  return pattern === name;
}

/**
 * A pattern that can never match a deliverable event is a subscription that
 * silently receives nothing, so it is refused when it is written instead.
 */
export function isDeliverablePattern(pattern: string): boolean {
  if (pattern === WILDCARD) {
    return true;
  }

  if (!pattern.endsWith(WILDCARD)) {
    return isDeliverableEvent(pattern);
  }

  const prefix = pattern.slice(0, -1);

  return DELIVERABLE_PREFIXES.some(
    (deliverable) =>
      prefix.startsWith(deliverable) || deliverable.startsWith(prefix),
  );
}
