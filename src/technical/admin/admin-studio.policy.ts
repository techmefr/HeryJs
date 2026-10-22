import { ability, isPlatformOperator } from '#technical/capabilities/ability';
import type { PolicyCheck } from '#technical/capabilities/capability-check';
import type { CapabilitySubject } from '#technical/capabilities/capabilities.types';
import { adminStudioSettings } from './admin-settings';

/**
 * Who may open the admin studio. In development and test every signed-in
 * developer may, as /introspect always allowed -- a decision, so it is written
 * down. In production it narrows to the platform operator
 * (PLATFORM_OPERATOR_IDS), and to a tenant admin as well only when
 * hery.config.ts sets `admin.studioAccess: 'tenant-admin'`; that admin then
 * reads its own tenant through the tenant context every studio route runs in.
 * Settings are read per decision, never cached, so there is no boot-time
 * state to be left permissive.
 */
function mayOpenStudio(subject: CapabilitySubject): boolean {
  const settings = adminStudioSettings();

  if (!settings.production || isPlatformOperator(subject.id)) {
    return true;
  }

  return settings.access === 'tenant-admin' && subject.role === 'admin';
}

const studioAbility = ability(mayOpenStudio);

// A named binding, so introspection reports which decision guards the route.
export const canUseAdminStudio: PolicyCheck = (subject) =>
  studioAbility(subject);
