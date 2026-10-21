import { ApiError, api, labelOf } from './api';
import type { DescribedController } from './api';

export type FieldType = 'string' | 'int' | 'boolean' | 'datetime' | 'file';

export interface DescribedField {
  name: string;
  type: FieldType;
  optional: boolean;
}

export interface JsonSchemaProperty {
  type?: string | string[];
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  enum?: unknown[];
}

export interface JsonSchema {
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

export interface DescribedInclude {
  childDelegate?: string;
}

export interface DescribedVersioning {
  field: string;
  header: string;
}

export interface DescribedTransition {
  name: string;
  from: string[];
  to: string;
  requires: string[];
}

export interface DescribedWorkflow {
  field: string;
  initial: string;
  states: string[];
  transitions: DescribedTransition[];
}

export interface ResourceDescription {
  version: number;
  versioned?: DescribedVersioning;
  workflow?: DescribedWorkflow;
  fields: DescribedField[];
  sorts: string[];
  filters: string[];
  selects: string[];
  includes: Record<string, DescribedInclude>;
  limits?: number[];
  defaultLimit?: number;
  paginated: boolean;
  softDeletes: boolean;
  relations: string[];
  rules: { create: JsonSchema; update: JsonSchema };
}

export interface Decision {
  allowed: boolean;
  scope?: string;
}

export type Decisions = Record<string, Decision | undefined>;

export interface ResourceRow {
  id: string;
  capabilities?: Decisions;
  [field: string]: unknown;
}

export interface SearchMeta {
  page?: number;
  limit?: number;
  last_page?: number;
  total?: number;
  paginated?: boolean;
  capabilities?: Decisions;
}

export interface SearchOutcome {
  rows: ResourceRow[];
  meta: SearchMeta;
  messages: string[];
}

export interface ResolvedFailure {
  status: number;
  key: string;
  message: string;
  details?: unknown;
}

export type BatchEntry =
  | { index: number; id?: string; status: 'ok'; data: unknown }
  | { index: number; id?: string; status: 'error'; error: ResolvedFailure };

export type MutationVerb =
  'create' | 'update' | 'delete' | 'restore' | 'transition';

export interface ResourceRef {
  base: string;
  label: string;
}

export interface FilterClause {
  field: string;
  operator: string;
  value: string | number | boolean | (string | number)[];
}

export interface SearchBody {
  page?: number;
  limit?: number;
  sorts?: { field: string; direction: 'asc' | 'desc' }[];
  filters?: FilterClause[];
  search?: { q: string };
  onlyTrashed?: boolean;
  capabilities?: string[];
}

export const MAX_BATCH_ENTRIES = 100;

const RESOURCE_ROUTES = [
  { method: 'POST', path: '/search' },
  { method: 'GET', path: '/describe' },
  { method: 'POST', path: '/create' },
];

export function resourcesOf(controllers: DescribedController[]): ResourceRef[] {
  return controllers
    .filter((controller) =>
      RESOURCE_ROUTES.every((wanted) =>
        controller.routes.some(
          (route) =>
            route.method === wanted.method && route.path === wanted.path,
        ),
      ),
    )
    .map((controller) => ({
      base: controller.basePath,
      label: labelOf(controller.basePath),
    }));
}

export function pascalOf(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function capabilityKeysOf(description: ResourceDescription): string[] {
  const keys = ['update', 'delete'];

  if (description.softDeletes) {
    keys.push('restore');
  }

  for (const relation of description.relations) {
    keys.push('attach' + pascalOf(relation), 'detach' + pascalOf(relation));
  }

  for (const transition of description.workflow?.transitions ?? []) {
    keys.push(transition.name);
  }

  return keys;
}

/**
 * The transitions a row can be offered: the ones whose source states include
 * the state the row is in. Whether the caller may fire one is the row's own
 * capability for it, read separately, so a button can be shown and disabled
 * rather than silently missing.
 */
export function transitionsFrom(
  description: Pick<ResourceDescription, 'workflow'>,
  row: ResourceRow,
): DescribedTransition[] {
  const workflow = description.workflow;

  if (!workflow) {
    return [];
  }

  const current = row[workflow.field];

  return workflow.transitions.filter(
    (transition) =>
      typeof current === 'string' && transition.from.includes(current),
  );
}

export function mutateTransition(
  base: string,
  id: string,
  transition: string,
): Promise<BatchEntry[]> {
  return mutate(base, 'transition', { data: [{ id, transition }] });
}

export function isAllowed(
  decisions: Decisions | undefined,
  key: string,
): boolean {
  return decisions?.[key]?.allowed === true;
}

export async function describeResource(
  base: string,
): Promise<ResourceDescription> {
  const { data } = await api<ResourceDescription>(base + '/describe');

  return data;
}

export async function searchResource(
  route: string,
  body: SearchBody,
): Promise<SearchOutcome> {
  const { data, meta, messages } = await api<ResourceRow[]>(route, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  return { rows: data, meta: (meta ?? {}) as SearchMeta, messages };
}

export async function mutate(
  base: string,
  verb: MutationVerb,
  body: Record<string, unknown>,
): Promise<BatchEntry[]> {
  const { data } = await api<BatchEntry[]>(base + '/' + verb, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  return data;
}

export function versionPartOf(
  description: Pick<ResourceDescription, 'versioned'>,
  row: ResourceRow | null,
): Record<string, number> {
  const field = description.versioned?.field;
  const value = field && row ? row[field] : undefined;

  return field && typeof value === 'number' ? { [field]: value } : {};
}

export function chunked<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }

  return chunks;
}

export async function mutateIds(
  base: string,
  verb: 'delete' | 'restore',
  ids: string[],
  extra: Record<string, unknown> = {},
): Promise<BatchEntry[]> {
  const entries: BatchEntry[] = [];

  for (const chunk of chunked(ids, MAX_BATCH_ENTRIES)) {
    try {
      entries.push(...(await mutate(base, verb, { ...extra, ids: chunk })));
    } catch (error) {
      entries.push(...chunk.map((id) => refusedEntry(id, error)));
    }
  }

  return entries;
}

function refusedEntry(id: string, error: unknown): BatchEntry {
  const status = error instanceof ApiError ? error.status : 0;
  const message =
    error instanceof ApiError
      ? (error.serverMessage ?? error.message)
      : 'The request could not be sent';

  return {
    index: -1,
    id,
    status: 'error',
    error: { status, key: 'request.failed', message },
  };
}

export interface BatchSummary {
  succeeded: string[];
  failed: { id: string; message: string }[];
}

export function summarize(entries: BatchEntry[]): BatchSummary {
  const summary: BatchSummary = { succeeded: [], failed: [] };

  for (const entry of entries) {
    const id = entry.id ?? 'entry ' + entry.index;

    if (entry.status === 'ok') {
      summary.succeeded.push(id);
    } else {
      summary.failed.push({ id, message: entry.error.message });
    }
  }

  return summary;
}

export function failureMessages(error: unknown): string[] {
  if (!(error instanceof ApiError)) {
    return ['The request could not be sent.'];
  }

  const found = messagesOfDetails(error.details);

  if (found.length > 0) {
    return found;
  }

  return [error.serverMessage ?? 'The API refused the request.'];
}

export function messagesOfDetails(details: unknown): string[] {
  if (typeof details !== 'object' || details === null) {
    return [];
  }

  const { formErrors, fieldErrors } = details as {
    formErrors?: unknown;
    fieldErrors?: unknown;
  };
  const messages: string[] = [];

  if (Array.isArray(formErrors)) {
    messages.push(...formErrors.filter((item) => typeof item === 'string'));
  }

  if (typeof fieldErrors === 'object' && fieldErrors !== null) {
    for (const [field, list] of Object.entries(fieldErrors)) {
      if (!Array.isArray(list)) {
        continue;
      }

      for (const item of list) {
        if (typeof item === 'string') {
          messages.push(field === 'data' ? item : field + ': ' + item);
        }
      }
    }
  }

  return messages;
}

export interface SplitIssues {
  fields: Record<string, string>;
  rest: string[];
}

export function splitIssues(
  details: unknown,
  fieldNames: string[],
): SplitIssues {
  const split: SplitIssues = { fields: {}, rest: [] };
  const issues =
    typeof details === 'object' && details !== null
      ? (details as { issues?: unknown }).issues
      : undefined;

  if (!Array.isArray(issues)) {
    return split;
  }

  for (const issue of issues as { path?: unknown; message?: unknown }[]) {
    const message = typeof issue.message === 'string' ? issue.message : null;
    const name = Array.isArray(issue.path) ? issue.path[2] : undefined;

    if (message === null) {
      continue;
    }

    if (typeof name === 'string' && fieldNames.includes(name)) {
      split.fields[name] = split.fields[name] ?? message;
    } else {
      split.rest.push(message);
    }
  }

  return split;
}
