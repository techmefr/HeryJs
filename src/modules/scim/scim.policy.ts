import { adminAbility, type PolicyCheck } from '#technical/public/capabilities';

export const canManageScim: PolicyCheck = adminAbility;
