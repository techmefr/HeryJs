import { adminAbility } from '#technical/capabilities/ability';
import type { PolicyCheck } from '#technical/capabilities/capability-check';

export const canManageWebhooks: PolicyCheck = adminAbility;
