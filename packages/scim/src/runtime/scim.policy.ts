import { adminAbility, type PolicyCheck } from '#kernel/public/capabilities';

export const canManageScim: PolicyCheck = adminAbility;
