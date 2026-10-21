/**
 * The icon names a contribution may ask for. The admin maps each one to a
 * drawn icon and falls back to a neutral one for a name it does not know, so
 * this list is what `lint:conventions admin-contract` holds a declaration to.
 */
export const ADMIN_ICONS = [
  'activity',
  'archive',
  'bell',
  'box',
  'clock',
  'database',
  'file',
  'flag',
  'globe',
  'key',
  'layers',
  'mail',
  'settings',
  'shield',
  'table',
  'users',
  'webhook',
  'zap',
] as const;

export type AdminIcon = (typeof ADMIN_ICONS)[number];
