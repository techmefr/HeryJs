import { ability, isPlatformOperator } from '#technical/capabilities/ability';
import type { PolicyCheck } from '#technical/capabilities/capability-check';
import { adminStudioSettings } from './admin-settings';

/**
 * Who may open the admin studio. In development and test every signed-in
 * developer may, as /introspect always allowed -- a decision, so it is written
 * down. In production it narrows to the platform operator
 * (PLATFORM_OPERATOR_IDS), never a tenant admin. The environment is read per
 * decision, never cached, so there is no boot-time state to be left permissive.
 */
const studioAbility = ability(
  (subject) =>
    !adminStudioSettings().production || isPlatformOperator(subject.id),
);

// A named binding, so introspection reports which decision guards the route.
export const canUseAdminStudio: PolicyCheck = (subject) =>
  studioAbility(subject);
