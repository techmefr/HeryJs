import { SetMetadata, UseInterceptors, applyDecorators } from '@nestjs/common';
import { AdminAuditInterceptor } from './admin-audit.interceptor';
import { ADMIN_ACTION, ADMIN_SECTION } from './admin-keys';
import type { AdminActionOptions, AdminSectionOptions } from './admin-types';

export { ADMIN_ACTION, ADMIN_SECTION };
export { ADMIN_ICONS } from './admin-icons';
export type { AdminIcon } from './admin-icons';
export type * from './admin-types';

/**
 * Marks a list route -- an argument-free GET or a POST `/search` -- as a
 * section of the admin, and says how to present it. A route without it is
 * still listed from introspection, titled from its path, so this is how a
 * feature takes over the presentation, never how it gets one at all.
 */
export const AdminSection = (options: AdminSectionOptions) =>
  SetMetadata(ADMIN_SECTION, options);

/**
 * Marks a route as something an operator can trigger from the admin. It
 * audits every call itself, so a feature cannot contribute an action that
 * leaves no trace; the route must still carry its own `@Capability`, which is
 * what the admin reads to decide whether to offer the button.
 */
export const AdminAction = (options: AdminActionOptions) =>
  applyDecorators(
    SetMetadata(ADMIN_ACTION, options),
    UseInterceptors(AdminAuditInterceptor),
  );
