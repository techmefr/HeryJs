import { adminAbility, everyone } from '#technical/capabilities/ability';
import type { PolicyCheck } from '#technical/capabilities/capability-check';

export const canManageOwnTwoFactor: PolicyCheck = everyone('own');

export const canManageTwoFactorRequirements: PolicyCheck = adminAbility;
