import { CATALOGUE } from '#technical/i18n/catalogue';
import { currentLocaleChain } from '#technical/i18n/translatable';
import { translateMessage } from '#technical/i18n/translate';
import type {
  AdminActionOptions,
  AdminColumn,
  AdminField,
  AdminSectionOptions,
} from './admin-types';

/**
 * A label is looked up under a key derived from where it sits -- the section
 * or action id, the column key, the field name -- so a decorator stays plain
 * English and a translation is a catalogue entry, not an edit to the
 * decorator. A label written as an `admin.*` key is translated as such.
 */
function adminText(key: string, literal: string): string {
  if (literal.startsWith('admin.')) {
    return translateMessage(literal);
  }

  const entry = CATALOGUE[key];
  const template = currentLocaleChain()
    .map((locale) => entry?.[locale])
    .find((candidate) => candidate !== undefined);

  if (template === undefined) {
    return literal;
  }

  return typeof template === 'function' ? template({}) : template;
}

function columnsOf(id: string, columns: AdminColumn[] | undefined) {
  return columns?.map((column) => ({
    ...column,
    label: adminText(`admin.${id}.column.${column.key}`, column.label),
  }));
}

function fieldsOf(id: string, fields: AdminField[] | undefined) {
  return fields?.map((field) => ({
    ...field,
    label: adminText(`admin.${id}.field.${field.name}`, field.label),
    help:
      field.help === undefined
        ? undefined
        : adminText(`admin.${id}.field.${field.name}.help`, field.help),
  }));
}

export function translateAdminSection(
  section: AdminSectionOptions,
): AdminSectionOptions {
  return {
    ...section,
    title: adminText(`admin.${section.id}.title`, section.title),
    group: adminText(`admin.group.${section.group}`, section.group),
    columns: columnsOf(section.id, section.columns),
  };
}

export function translateAdminAction(
  action: AdminActionOptions,
): AdminActionOptions {
  return {
    ...action,
    title: adminText(`admin.${action.id}.title`, action.title),
    confirm:
      action.confirm === undefined
        ? undefined
        : adminText(`admin.${action.id}.confirm`, action.confirm),
    fields: fieldsOf(action.id, action.fields),
  };
}
