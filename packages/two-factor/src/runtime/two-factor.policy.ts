import {
  adminAbility,
  everyone,
  type PolicyCheck,
} from '#kernel/public/capabilities';

export const canManageOwnTwoFactor: PolicyCheck = everyone('own');

export const canManageTwoFactorRequirements: PolicyCheck = adminAbility;
