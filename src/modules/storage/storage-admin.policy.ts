import { adminAbility, type PolicyCheck } from '@heryjs/core/capabilities';

// Browsing and deleting the tenant's files is an operator's job, not a user's:
// a user reaches their own files through whatever record holds the key. The
// upload route stays open to any authenticated caller, as before.
export const canManageFiles: PolicyCheck = adminAbility;
