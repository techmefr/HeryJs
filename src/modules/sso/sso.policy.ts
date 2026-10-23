import { adminAbility, type PolicyCheck } from '#technical/public/capabilities';

export const canManageSso: PolicyCheck = adminAbility;
