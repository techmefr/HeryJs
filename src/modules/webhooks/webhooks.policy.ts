import { adminAbility, type PolicyCheck } from '#technical/public/capabilities';

export const canManageWebhooks: PolicyCheck = adminAbility;
