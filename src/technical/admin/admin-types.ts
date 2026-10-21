import type { AdminIcon } from './admin-icons';

export type AdminColumnFormat =
  'text' | 'number' | 'date' | 'boolean' | 'badge' | 'json';

export interface AdminColumn {
  key: string;
  label: string;
  format?: AdminColumnFormat;
  hidden?: boolean;
}

export type AdminFieldType =
  'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'password';

export interface AdminField {
  name: string;
  label: string;
  type: AdminFieldType;
  required?: boolean;
  help?: string;
  options?: string[];
}

export interface AdminSectionOptions {
  /** Stable, unique across the application: actions point at it. */
  id: string;
  title: string;
  icon: AdminIcon;
  /** The sidebar group the section sits under. */
  group: string;
  /** Lower first inside the group; ties fall back to the title. */
  order?: number;
  columns?: AdminColumn[];
}

/**
 * `row` acts on one listed row and needs `:id` in its path, `bulk` on the
 * ticked rows (the admin sends `{ ids }`), `global` on the section as a whole
 * or on nothing in particular, which is also what a form-only action is.
 */
export type AdminActionScope = 'row' | 'bulk' | 'global';

export interface AdminActionOptions {
  id: string;
  title: string;
  icon: AdminIcon;
  /** The section the action belongs to; omitted, it is a page-level action. */
  section?: string;
  scope: AdminActionScope;
  /** A sentence the operator must confirm before the request is sent. */
  confirm?: string;
  danger?: boolean;
  /** Inputs the admin collects and sends as the JSON body. */
  fields?: AdminField[];
}
