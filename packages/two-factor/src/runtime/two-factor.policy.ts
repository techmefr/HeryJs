import {
  adminAbility,
  everyone,
  type PolicyCheck,
} from '@heryjs/core/capabilities';

export const canManageOwnTwoFactor: PolicyCheck = everyone('own');

export const canManageTwoFactorRequirements: PolicyCheck = adminAbility;
