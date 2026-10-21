import { clearToken, token } from './session';

export const API_URL =
  import.meta.env.PUBLIC_API_URL ?? 'http://localhost:3000';

export interface Envelope<T> {
  data: T;
  meta?: unknown;
  messages: string[];
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details: unknown = null,
    readonly serverMessage: string | null = null,
  ) {
    super(message);
  }
}

async function failureOf(
  response: Response,
): Promise<{ details: unknown; message: string | null }> {
  try {
    const body = (await response.json()) as {
      error?: { message?: unknown; details?: unknown };
    };
    const message = body.error?.message;

    return {
      details: body.error?.details ?? null,
      message: typeof message === 'string' ? message : null,
    };
  } catch {
    return { details: null, message: null };
  }
}

/**
 * Caller headers go through `Headers` rather than an object spread: `HeadersInit`
 * is also a `Headers` instance or an array of pairs, and spreading either of
 * those into an object literal silently yields no header at all.
 */
export async function api<T>(
  route: string,
  init?: RequestInit,
): Promise<Envelope<T>> {
  const headers = new Headers(init?.headers);

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (!headers.has('Authorization')) {
    headers.set('Authorization', 'Bearer ' + (token() ?? ''));
  }

  const response = await fetch(API_URL + route, { ...init, headers });

  // A stale token is the common case here, and every page would otherwise have
  // to handle it: drop it and send the caller back to the form once.
  if (response.status === 401) {
    clearToken();
    window.location.href = '/login';
    throw new ApiError('Session expired', 401);
  }

  if (!response.ok) {
    const failure = await failureOf(response);

    throw new ApiError(
      'Request to ' + route + ' failed',
      response.status,
      failure.details,
      failure.message,
    );
  }

  return (await response.json()) as Envelope<T>;
}

export type AdminColumnFormat =
  'text' | 'number' | 'date' | 'boolean' | 'badge' | 'json';

export interface AdminColumn {
  key: string;
  label: string;
  format?: AdminColumnFormat;
  hidden?: boolean;
}

export interface AdminField {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'password';
  required?: boolean;
  help?: string;
  options?: string[];
}

export interface AdminSectionMeta {
  kind: 'section';
  id: string;
  title: string;
  icon: string;
  group: string;
  order?: number;
  columns?: AdminColumn[];
}

export interface AdminActionMeta {
  kind: 'action';
  id: string;
  title: string;
  icon: string;
  section?: string;
  scope: 'row' | 'bulk' | 'global';
  confirm?: string;
  danger?: boolean;
  fields?: AdminField[];
}

export interface DescribedRoute {
  method: string;
  path: string;
  handler: string;
  capability?: string;
  admin?: AdminSectionMeta | AdminActionMeta;
}

export interface DescribedController {
  name: string;
  basePath: string;
  routes: DescribedRoute[];
}

export const DEFAULT_GROUP = 'Sections';

export interface AdminSection {
  label: string;
  path: string;
  method: 'GET' | 'POST';
  // What a feature declared with @AdminSection; absent for a route the admin
  // only discovered, which keeps the title taken from its path.
  id?: string;
  icon?: string;
  group: string;
  order: number;
  columns?: AdminColumn[];
}

// The overview already reports these, and /signal/stream never ends.
// /pipeline/traces and /devtools/* get dedicated pages (pipeline.astro,
// devtools.astro) rather than
// the generic flat table, so it's hidden from the auto-discovered sidebar
// sections the same way /introspect and /health are. /expose is the mine's
// own catalog route (see prune.astro for a page built on top of it), not a
// section in its own right. /feature-flags has a page of its own (flags.astro).
const HIDDEN_PATHS = [
  '/',
  '/introspect',
  '/expose',
  '/feature-flags',
  '/health',
  '/storage-admin/files',
  '/storage-admin/status',
  '/health/live',
  '/health/ready',
  '/metrics',
  '/quotas',
  '/quotas/defaults',
  '/quotas/tenants',
  '/pipeline/traces',
  '/devtools/entries',
  '/devtools/summary',
  // A file download, not JSON: the Audit page owns the export button.
  '/audit-logs/export',
  '/signal/stream',
  '/backups',
  '/backups/schedule',
];

// A section is any GET route that takes no argument, whether it sits at the root
// of a resource or deeper like /inspector/requests, or a POST route ending in
// /search -- the Lomkit-style search contract takes its query in the body, so
// it never shows up as a plain listable GET. Nothing has to be registered:
// installing a module that ships such a route is enough for it to show up here.
export function sectionsOf(controllers: DescribedController[]): AdminSection[] {
  return controllers.flatMap((controller) =>
    controller.routes
      .filter(
        (route) =>
          (route.method === 'GET' && !route.path.includes(':')) ||
          (route.method === 'POST' &&
            route.path.endsWith('/search') &&
            !route.path.includes(':')),
      )
      .map((route) => ({
        method: route.method as 'GET' | 'POST',
        path:
          route.path === '/'
            ? controller.basePath
            : controller.basePath + route.path,
        declared: route.admin?.kind === 'section' ? route.admin : undefined,
      }))
      .filter(
        (route) =>
          !HIDDEN_PATHS.includes(route.path) &&
          !route.path.endsWith('/describe'),
      )
      .map((route) => ({
        label:
          route.declared?.title ??
          labelOf(
            route.method === 'POST'
              ? route.path.slice(0, -'/search'.length)
              : route.path,
          ),
        path: route.path,
        method: route.method,
        id: route.declared?.id,
        icon: route.declared?.icon,
        group: route.declared?.group ?? DEFAULT_GROUP,
        order: route.declared?.order ?? DEFAULT_ORDER,
        columns: route.declared?.columns,
      })),
  );
}

const DEFAULT_ORDER = 100;

/**
 * The sidebar's shape: contributed groups by name, the discovered sections
 * last under their own heading, and inside a group the declared order first,
 * then the title -- so two features never fight over a position.
 */
export function groupedSections(
  sections: AdminSection[],
): Array<{ group: string; sections: AdminSection[] }> {
  const groups = new Map<string, AdminSection[]>();

  for (const section of sections) {
    groups.set(section.group, [...(groups.get(section.group) ?? []), section]);
  }

  return [...groups.entries()]
    .sort(([left], [right]) =>
      left === DEFAULT_GROUP
        ? 1
        : right === DEFAULT_GROUP
          ? -1
          : left.localeCompare(right),
    )
    .map(([group, members]) => ({
      group,
      sections: [...members].sort(
        (left, right) =>
          left.order - right.order || left.label.localeCompare(right.label),
      ),
    }));
}

export function labelOf(route: string): string {
  return route
    .split('/')
    .filter(Boolean)
    .flatMap((segment) => segment.split('-'))
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
