import { adminAbility, everyone } from '#technical/capabilities/ability';
import type { PolicyCheck } from '#technical/capabilities/capability-check';

// Whether a caller may ask at all. Whose data it may ask about is the other
// half, and needs the subject the request names, so the service checks that
// one: a person acts on their own data, and an admin on anyone's in the tenant.
export const canRequestPrivacyAction: PolicyCheck = everyone('own');

// Erasing a whole tenant is irreversible and reaches every user in it, the
// same reasoning as pruning: no "own" scope means anything here.
export const canEraseTenant: PolicyCheck = adminAbility;
