import { adminAbility } from '#kernel/capabilities/ability';
import type { PolicyCheck } from '#kernel/capabilities/capability-check';

export const canManageScim: PolicyCheck = adminAbility;
