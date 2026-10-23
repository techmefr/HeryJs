import { adminAbility, type PolicyCheck } from '#kernel/public/capabilities';

export const canManageWebhooks: PolicyCheck = adminAbility;
