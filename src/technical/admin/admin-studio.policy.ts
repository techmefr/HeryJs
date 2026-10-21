import { ability } from '#technical/capabilities/ability';
import { adminStudioSettings } from './admin-settings';

/**
 * Who may open the admin studio. In development and test every signed-in
 * developer may, as /introspect always allowed -- a decision, so it is written
 * down. In production it narrows to the platform admin: the role the
 * impersonation and audit capabilities already trust with what tenant scoping
 * cannot contain. The environment is read per decision, never cached, so
 * there is no boot-time state to be left permissive.
 */
export const canUseAdminStudio = ability(
  (subject) => !adminStudioSettings().production || subject.role === 'admin',
);
