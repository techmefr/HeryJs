import type { ResourceDescription, ResourceRow } from './resource';

export type FieldKind = 'text' | 'number' | 'checkbox' | 'datetime' | 'select';
export type FormMode = 'create' | 'update';
export type FormValue = string | boolean;
export type FormValues = Record<string, FormValue>;

export interface FormField {
  name: string;
  label: string;
  kind: FieldKind;
  required: boolean;
  integer: boolean;
  readonly: boolean;
  options?: string[];
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
}

const KIND_BY_TYPE = {
  string: 'text',
  file: 'text',
  int: 'number',
  boolean: 'checkbox',
  datetime: 'datetime',
} as const;

function boundOf(value: number | undefined): number | undefined {
  if (value === undefined || Math.abs(value) >= Number.MAX_SAFE_INTEGER) {
    return undefined;
  }

  return value;
}

export function humanize(name: string): string {
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();

  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function formFieldsOf(
  description: ResourceDescription,
  mode: FormMode,
): FormField[] {
  const rules = description.rules[mode];
  const required = new Set(mode === 'create' ? (rules.required ?? []) : []);
  const fields: FormField[] = [];

  for (const field of description.fields) {
    const schema = rules.properties?.[field.name];

    if (!schema) {
      continue;
    }

    const isRequired = required.has(field.name);
    const options = Array.isArray(schema.enum)
      ? schema.enum.map((option) => String(option))
      : undefined;

    fields.push({
      name: field.name,
      label: humanize(field.name),
      kind: options ? 'select' : KIND_BY_TYPE[field.type],
      required: isRequired,
      integer: field.type === 'int',
      readonly: false,
      options,
      minLength: schema.minLength,
      maxLength: schema.maxLength,
      minimum: boundOf(schema.minimum),
      maximum: boundOf(schema.maximum),
      pattern: schema.pattern,
    });
  }

  return fields;
}

export function toLocalInput(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);

  return shifted.toISOString().slice(0, 16);
}

export function valuesOf(
  fields: FormField[],
  row: ResourceRow | null,
): FormValues {
  const values: FormValues = {};

  for (const field of fields) {
    const current = row?.[field.name];

    if (field.kind === 'checkbox') {
      values[field.name] = current === true;
    } else if (field.kind === 'datetime') {
      values[field.name] = toLocalInput(current);
    } else {
      values[field.name] =
        current === null || current === undefined ? '' : String(current);
    }
  }

  return values;
}

function lengthError(field: FormField, text: string): string | null {
  if (field.minLength !== undefined && text.length < field.minLength) {
    return 'At least ' + field.minLength + ' characters';
  }

  if (field.maxLength !== undefined && text.length > field.maxLength) {
    return 'At most ' + field.maxLength + ' characters';
  }

  return null;
}

function numberError(field: FormField, text: string): string | null {
  const number = Number(text);

  if (Number.isNaN(number)) {
    return 'Must be a number';
  }

  if (field.integer && !Number.isInteger(number)) {
    return 'Must be a whole number';
  }

  if (field.minimum !== undefined && number < field.minimum) {
    return 'At least ' + field.minimum;
  }

  if (field.maximum !== undefined && number > field.maximum) {
    return 'At most ' + field.maximum;
  }

  return null;
}

function patternError(field: FormField, text: string): string | null {
  if (field.pattern === undefined) {
    return null;
  }

  try {
    return new RegExp(field.pattern, 'u').test(text)
      ? null
      : 'Does not match the expected format';
  } catch {
    return null;
  }
}

function fieldError(field: FormField, value: FormValue): string | null {
  if (field.kind === 'checkbox' || field.readonly) {
    return null;
  }

  const text = String(value);

  if (text === '') {
    return field.required ? 'Required' : null;
  }

  if (field.kind === 'datetime') {
    return Number.isNaN(new Date(text).getTime()) ? 'Not a valid date' : null;
  }

  if (field.kind === 'number') {
    return numberError(field, text);
  }

  if (field.kind === 'select') {
    return field.options?.includes(text) ? null : 'Not an allowed value';
  }

  return lengthError(field, text) ?? patternError(field, text);
}

function clearedError(
  field: FormField,
  value: FormValue,
  initial: FormValues | null,
): string | null {
  const before = initial?.[field.name];

  if (field.kind === 'checkbox' || value !== '' || !before) {
    return null;
  }

  return 'Cannot be cleared once set';
}

export function validate(
  fields: FormField[],
  values: FormValues,
  initial: FormValues | null = null,
): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const field of fields) {
    const value = values[field.name] ?? '';
    const error =
      clearedError(field, value, initial) ?? fieldError(field, value);

    if (error) {
      errors[field.name] = error;
    }
  }

  return errors;
}

function payloadValue(field: FormField, value: FormValue): unknown {
  if (field.kind === 'checkbox') {
    return value === true;
  }

  const text = String(value);

  if (field.kind === 'number') {
    return Number(text);
  }

  if (field.kind === 'datetime') {
    return new Date(text).toISOString();
  }

  return text;
}

export function payloadOf(
  fields: FormField[],
  values: FormValues,
  initial: FormValues,
  mode: FormMode,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  for (const field of fields) {
    const value = values[field.name] ?? '';

    if (field.readonly) {
      continue;
    }

    if (mode === 'update' && value === initial[field.name]) {
      continue;
    }

    if (value === '') {
      continue;
    }

    payload[field.name] = payloadValue(field, value);
  }

  return payload;
}
