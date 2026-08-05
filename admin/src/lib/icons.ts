import {
  Activity,
  Bell,
  Check,
  ChevronRight,
  Clock,
  Inbox,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Mail,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  Sprout,
  Table2,
  ToggleRight,
  Trash2,
  Workflow,
  X,
  Zap,
  createElement,
} from 'lucide';

type IconNode = Parameters<typeof createElement>[0];

export const ICONS = {
  brand: Zap,
  crumb: ChevronRight,
  empty: Inbox,
  lock: LockKeyhole,
  no: X,
  overview: LayoutDashboard,
  pipeline: Workflow,
  prune: Trash2,
  refresh: RefreshCw,
  signOut: LogOut,
  yes: Check,
};

const BY_ROUTE: Record<string, IconNode | undefined> = {
  '/audit-logs': ScrollText,
  '/audit-logs/verify': ShieldCheck,
  '/feature-flags': ToggleRight,
  '/inspector/requests': Activity,
  '/mail': Mail,
  '/notifications': Bell,
  '/scheduler/tasks': Clock,
  '/seeders': Sprout,
  '/blog-posts': Table2,
};

/**
 * Falls back to a neutral table icon, so a route this admin has never heard of
 * still gets a proper entry instead of a hole in the nav.
 */
export function iconFor(route: string): IconNode {
  return BY_ROUTE[route] ?? Table2;
}

export function icon(node: IconNode, size = 16): SVGElement {
  const element = createElement(node);
  element.setAttribute('width', String(size));
  element.setAttribute('height', String(size));
  element.setAttribute('aria-hidden', 'true');

  return element;
}

const TINTS = 6;

/**
 * Picks one of the accent hues from the route itself, so a section keeps the
 * same colour across reloads and a module nobody planned for still gets one.
 */
export function tintOf(route: string): string {
  let hash = 0;

  for (const character of route) {
    hash = (hash * 31 + character.charCodeAt(0)) % 9973;
  }

  return 'tint-' + (hash % TINTS);
}
