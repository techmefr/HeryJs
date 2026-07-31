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
  ) {
    super(message);
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
    throw new ApiError('Request to ' + route + ' failed', response.status);
  }

  return (await response.json()) as Envelope<T>;
}

export interface DescribedRoute {
  method: string;
  path: string;
  handler: string;
  capability?: string;
}

export interface DescribedController {
  name: string;
  basePath: string;
  routes: DescribedRoute[];
}

export interface AdminSection {
  label: string;
  path: string;
}

// The overview already reports these, and /signal/stream never ends.
const HIDDEN_PATHS = [
  '/',
  '/describe',
  '/health',
  '/metrics',
  '/signal/stream',
];

// A section is any GET route that takes no argument, whether it sits at the root
// of a resource or deeper like /inspector/requests. Nothing has to be
// registered: installing a module that ships such a route is enough for it to
// show up here.
export function sectionsOf(controllers: DescribedController[]): AdminSection[] {
  return controllers.flatMap((controller) =>
    controller.routes
      .filter((route) => route.method === 'GET' && !route.path.includes(':'))
      .map((route) =>
        route.path === '/'
          ? controller.basePath
          : controller.basePath + route.path,
      )
      .filter((route) => !HIDDEN_PATHS.includes(route))
      .map((route) => ({ label: labelOf(route), path: route })),
  );
}

export function labelOf(route: string): string {
  return route
    .split('/')
    .filter(Boolean)
    .flatMap((segment) => segment.split('-'))
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
