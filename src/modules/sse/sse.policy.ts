import type { PolicyCheck } from '#technical/capabilities/capability-check';

/**
 * A token grants a stream of whatever the caller's own tenant publishes,
 * never a choice of tenant -- so every signed-in caller may mint one, the
 * same way every signed-in caller may mint a `signal` token. What a channel
 * actually carries is a decision the publisher already made when it chose to
 * call `SseStreamService.publish`; this only decides who may listen at all.
 */
export const canIssueSseToken: PolicyCheck = () => ({
  allowed: true,
  scope: 'own',
});
