import { adminAbility, type PolicyCheck } from '#kernel/public/capabilities';

export const canManageSso: PolicyCheck = adminAbility;
