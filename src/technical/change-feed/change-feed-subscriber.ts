import type { AuthenticatedUser } from '#technical/auth/auth.types';
import { subjectOf } from '#technical/capabilities/subject';
import type { ChangeFeedSubscriber } from './change-feed.types';

export function subscriberOf(user: AuthenticatedUser): ChangeFeedSubscriber {
  return {
    tenantId: user.tenantId,
    userId: user.id,
    subject: subjectOf(user),
  };
}
