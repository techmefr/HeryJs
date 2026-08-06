import type { PermissionPreset } from '#technical/capabilities/capabilities.types';

/**
 * What the blueprint's permissions became. The blueprint itself is never read
 * at runtime, so this object is the single declaration of the four presets:
 * the detail route resolves one against a loaded record, the collection query
 * turns the same one into a where clause, and the view reports it to the
 * client. Every one of them reads this object rather than repeating a literal.
 *
 * That matters because the failure mode is silent. A preset tightened in the
 * policy and forgotten in the service produces a record the detail route
 * refuses and the list route hands out in full -- no error, just data that
 * should have been withheld. With one declaration there is no second place to
 * forget, and pnpm lint:scope-parity fails the build on any call that passes a
 * literal instead.
 */
export const BLOG_POST_PRESETS = {
  view: 'own',
  create: 'own',
  update: 'own',
  delete: 'own',
} as const satisfies Record<
  'view' | 'create' | 'update' | 'delete',
  PermissionPreset
>;
