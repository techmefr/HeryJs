import { adminAbility, type PolicyCheck } from '@heryjs/core/capabilities';

export const canManageWebhooks: PolicyCheck = adminAbility;
