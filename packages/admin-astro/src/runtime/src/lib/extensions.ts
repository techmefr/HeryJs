import type { ResourceDescription, ResourceRow } from './resource';

export interface RowActionContext {
  base: string;
  reload: () => Promise<void>;
}

export interface RowAction {
  id: string;
  label: string;
  capability?: string;
  run: (row: ResourceRow, context: RowActionContext) => Promise<void> | void;
}

export interface FieldOverride {
  label?: string;
  help?: string;
  placeholder?: string;
  hidden?: boolean;
  readonly?: boolean;
}

export interface ColumnOverride {
  label?: string;
  hidden?: boolean;
  format?: (value: unknown, row: ResourceRow) => string;
}

export type DisableableFeature =
  'create' | 'update' | 'delete' | 'bulk' | 'filters' | 'search' | 'relations';

export interface ResourceExtension {
  label?: string;
  columns?: Record<string, ColumnOverride>;
  fields?: Record<string, FieldOverride>;
  rowActions?: RowAction[];
  disable?: DisableableFeature[];
}

export interface AdminExtensions {
  resources?: Record<string, ResourceExtension>;
}

export function defineExtensions(extensions: AdminExtensions): AdminExtensions {
  return extensions;
}

export function extensionFor(
  extensions: AdminExtensions,
  base: string,
): ResourceExtension {
  return extensions.resources?.[base] ?? {};
}

export function isDisabled(
  extension: ResourceExtension,
  feature: DisableableFeature,
): boolean {
  return extension.disable?.includes(feature) === true;
}

export function extraCapabilityKeys(extension: ResourceExtension): string[] {
  return (extension.rowActions ?? []).flatMap((action) =>
    action.capability ? [action.capability] : [],
  );
}

export function unknownOverrides(
  extension: ResourceExtension,
  description: ResourceDescription,
): string[] {
  const known = new Set([
    'id',
    ...description.selects,
    ...description.fields.map((field) => field.name),
  ]);
  const mentioned = [
    ...Object.keys(extension.fields ?? {}),
    ...Object.keys(extension.columns ?? {}),
  ];

  return [...new Set(mentioned)].filter((name) => !known.has(name));
}

export function requiredButHidden(
  extension: ResourceExtension,
  description: ResourceDescription,
): string[] {
  const required = description.rules.create.required ?? [];

  return required.filter((name) => {
    const override = extension.fields?.[name];

    return override?.hidden === true || override?.readonly === true;
  });
}
