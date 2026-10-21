import { adminAbility, everyone } from '#kernel/capabilities/ability';
import type { PolicyCheck } from '#kernel/capabilities/capability-check';

export const canManageOwnTwoFactor: PolicyCheck = everyone('own');

export const canManageTwoFactorRequirements: PolicyCheck = adminAbility;
