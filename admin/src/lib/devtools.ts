export const DEVTOOLS_KINDS = [
  'request',
  'slow-query',
  'n-plus-one',
  'job',
  'mail',
  'sms',
  'push',
  'exception',
] as const;

export type DevtoolsKind = (typeof DEVTOOLS_KINDS)[number];

export interface DevtoolsEntry {
  id: string;
  kind: string;
  label: string;
  status: string | null;
  durationMs: number | null;
  requestId: string | null;
  detail: unknown;
  createdAt: string;
}

export interface DevtoolsPageMeta {
  page: number;
  limit: number;
  total: number;
  last_page: number;
}

const KIND_LABELS: Record<DevtoolsKind, string> = {
  request: 'Requests',
  'slow-query': 'Slow queries',
  'n-plus-one': 'N+1',
  job: 'Jobs',
  mail: 'Mail',
  sms: 'SMS',
  push: 'Push',
  exception: 'Exceptions',
};

const DANGER_STATUSES = new Set(['failed']);

export function kindLabel(kind: DevtoolsKind): string {
  return KIND_LABELS[kind];
}

export function entriesPath(kind: DevtoolsKind, page: number): string {
  return '/devtools/entries?kind=' + kind + '&page=' + page;
}

export function entryTone(entry: DevtoolsEntry): string {
  if (entry.kind === 'exception') {
    return 'danger';
  }

  if (entry.status !== null && DANGER_STATUSES.has(entry.status)) {
    return 'danger';
  }

  if (entry.kind === 'slow-query' || entry.kind === 'n-plus-one') {
    return 'warn';
  }

  if (entry.kind === 'request' && Number(entry.status) >= 500) {
    return 'danger';
  }

  if (entry.kind === 'request' && Number(entry.status) >= 400) {
    return 'warn';
  }

  return 'ok';
}

function summarise(detail: unknown): string {
  if (typeof detail !== 'object' || detail === null) {
    return '';
  }

  const fields = detail as Record<string, unknown>;
  const parts: string[] = [];

  if (typeof fields.count === 'number') {
    parts.push('x' + fields.count);
  }

  for (const key of ['recipient', 'error', 'message']) {
    const value = fields[key];

    if (typeof value === 'string' && value !== '') {
      parts.push(value);
    }
  }

  return parts.join(' · ');
}

export function entryRow(entry: DevtoolsEntry): Record<string, unknown> {
  return {
    when: entry.createdAt,
    label: entry.label,
    status: entry.status,
    ms:
      entry.durationMs === null
        ? null
        : Math.round(entry.durationMs * 100) / 100,
    detail: summarise(entry.detail) || null,
  };
}
