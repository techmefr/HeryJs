import {
  Activity,
  Archive,
  Bell,
  Box,
  Bug,
  Check,
  ChevronRight,
  Clock,
  Gauge,
  Database,
  File,
  Flag,
  Globe,
  Inbox,
  Key,
  Layers,
  LayoutDashboard,
  ListChecks,
  LockKeyhole,
  LogOut,
  Mail,
  RefreshCw,
  ScrollText,
  Settings,
  Shield,
  ShieldCheck,
  Sprout,
  Table2,
  ToggleRight,
  Trash2,
  Users,
  Webhook,
  Workflow,
  X,
  Zap,
  createElement,
} from 'lucide';

type IconNode = Parameters<typeof createElement>[0];

export const ICONS = {
  backups: Database,
  brand: Zap,
  crumb: ChevronRight,
  devtools: Bug,
  empty: Inbox,
  jobFlows: ListChecks,
  flags: ToggleRight,
  lock: LockKeyhole,
  no: X,
  overview: LayoutDashboard,
  pipeline: Workflow,
  privacy: ShieldCheck,
  prune: Trash2,
  quotas: Gauge,
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
  '/privacy/requests': ShieldCheck,
  '/quotas': Gauge,
  '/scheduler/tasks': Clock,
  '/seeders': Sprout,
  '/blog-posts': Table2,
};

// The names @AdminSection and @AdminAction accept, one drawn icon each. A name
// this build does not know falls back to the neutral table icon rather than
// leaving a hole, so a newer API never breaks an older admin.
const BY_NAME: Record<string, IconNode | undefined> = {
  activity: Activity,
  archive: Archive,
  bell: Bell,
  box: Box,
  clock: Clock,
  database: Database,
  file: File,
  flag: Flag,
  globe: Globe,
  key: Key,
  layers: Layers,
  mail: Mail,
  settings: Settings,
  shield: Shield,
  table: Table2,
  users: Users,
  webhook: Webhook,
  zap: Zap,
};

export function adminIcon(name: string | undefined, route: string): IconNode {
  return (name === undefined ? undefined : BY_NAME[name]) ?? iconFor(route);
}

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
