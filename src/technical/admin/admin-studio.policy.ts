import { ability } from '#technical/capabilities/ability';
import type { PolicyCheck } from '#technical/capabilities/capability-check';
import { adminStudioSettings } from './admin-settings';

/**
 * Who may open the admin studio. In development and test every signed-in
 * developer may, as /introspect always allowed -- a decision, so it is written
 * down. In production it narrows to the platform admin: the role the
 * impersonation and audit capabilities already trust with what tenant scoping
 * cannot contain. The environment is read per decision, never cached, so
 * there is no boot-time state to be left permissive.
 */
const studioAbility = ability(
  (subject) => !adminStudioSettings().production || subject.role === 'admin',
);

// A named binding, so introspection reports which decision guards the route.
export const canUseAdminStudio: PolicyCheck = (subject) =>
  studioAbility(subject);
