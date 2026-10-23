import {
  adminAbility,
  everyone,
  type PolicyCheck,
} from '#technical/public/capabilities';

export const canManageOwnTwoFactor: PolicyCheck = everyone('own');

export const canManageTwoFactorRequirements: PolicyCheck = adminAbility;
