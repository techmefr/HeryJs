import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import pc from 'picocolors';
import { registerModule } from '../lib/module-registry';

const WORKSPACE_FILE = 'pnpm-workspace.yaml';

const PACKAGE_CONTENT = `{
  "name": "admin",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "lint": "eslint \\"src/**/*.ts\\""
  },
  "dependencies": {
    "astro": "^5.16.2",
    "lucide": "^1.27.0"
  },
  "devDependencies": {
    "@eslint/js": "^9.18.0",
    "eslint": "^10.8.0",
    "globals": "^17.0.0",
    "typescript": "^5.9.3",
    "typescript-eslint": "^8.20.0"
  }
}
`;

const ASTRO_CONFIG_CONTENT = `import { defineConfig } from 'astro/config';

// Static output on purpose: every page authenticates from the browser with the
// session token, so there is nothing to render on a server and no adapter to
// deploy. The pages are files.
export default defineConfig({
  server: { port: 4322 },
});
`;

const TSCONFIG_CONTENT = `{
  "extends": "astro/tsconfigs/strict",
  "include": [".astro/types.d.ts", "**/*"],
  "exclude": ["dist"]
}
`;

const ESLINT_CONTENT = `import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', '.astro'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
);
`;

const SESSION_CONTENT = `const TOKEN_KEY = 'heryjs-admin-token';

export function token(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function storeToken(value: string): void {
  localStorage.setItem(TOKEN_KEY, value);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}
`;

const API_CONTENT = `import { clearToken, token } from './session';

export const API_URL = import.meta.env.PUBLIC_API_URL ?? 'http://localhost:3000';

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

export async function api<T>(route: string, init?: RequestInit): Promise<Envelope<T>> {
  const response = await fetch(API_URL + route, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + (token() ?? ''),
      ...init?.headers,
    },
  });

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
const HIDDEN_PATHS = ['/', '/describe', '/health', '/metrics', '/signal/stream'];

// A section is any GET route that takes no argument, whether it sits at the root
// of a resource or deeper like /inspector/requests. Nothing has to be
// registered: installing a module that ships such a route is enough for it to
// show up here.
export function sectionsOf(controllers: DescribedController[]): AdminSection[] {
  return controllers.flatMap((controller) =>
    controller.routes
      .filter((route) => route.method === 'GET' && !route.path.includes(':'))
      .map((route) => (route.path === '/' ? controller.basePath : controller.basePath + route.path))
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
`;

const ICONS_CONTENT = `import {
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
  '/workouts': Table2,
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
`;

const RENDER_CONTENT = `import { ICONS, icon } from './icons';

const ISO_DATE = /^\\d{4}-\\d{2}-\\d{2}T/;
const HTTP_METHODS = new Set(['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD', 'OPTIONS']);

export function pill(text: string, tone: string): HTMLElement {
  const element = document.createElement('span');
  element.className = 'pill pill-' + tone;
  element.textContent = text;

  return element;
}

export function methodBadge(method: string): HTMLElement {
  return pill(method, method.toLowerCase());
}

function statusTone(status: number): string {
  if (status >= 500) {
    return 'danger';
  }

  if (status >= 400) {
    return 'warn';
  }

  return status >= 300 ? 'neutral' : 'ok';
}

function writeCell(target: HTMLTableCellElement, column: string, value: unknown): void {
  if (value === null || value === undefined) {
    target.className = 'nothing';
    target.textContent = '—';
    return;
  }

  if (typeof value === 'boolean') {
    const badge = pill(String(value), value ? 'ok' : 'neutral');
    badge.prepend(icon(value ? ICONS.yes : ICONS.no, 12));
    target.appendChild(badge);
    return;
  }

  if (typeof value === 'number') {
    if (column === 'status') {
      target.appendChild(pill(String(value), statusTone(value)));
      return;
    }

    target.className = 'mono';
    target.textContent = Number.isInteger(value) ? String(value) : value.toFixed(2);
    return;
  }

  if (typeof value === 'object') {
    target.className = 'mono';
    target.textContent = JSON.stringify(value);
    return;
  }

  const text = String(value);

  if (column === 'method' && HTTP_METHODS.has(text)) {
    target.appendChild(methodBadge(text));
    return;
  }

  target.className = 'mono';
  target.textContent = ISO_DATE.test(text) ? text.replace('T', ' ').slice(0, 19) : text;
  target.title = text;
}

export function table(rows: Record<string, unknown>[]): HTMLElement {
  // Columns come from the payload itself, so a field the resource view strips
  // never reaches this table in the first place.
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];

  const element = document.createElement('table');
  const head = element.createTHead().insertRow();

  for (const column of columns) {
    const heading = document.createElement('th');
    heading.textContent = column;
    head.appendChild(heading);
  }

  const body = element.createTBody();

  for (const row of rows) {
    const line = body.insertRow();

    for (const column of columns) {
      writeCell(line.insertCell(), column, row[column]);
    }
  }

  const card = document.createElement('div');
  card.className = 'card scroll';
  card.appendChild(element);

  return card;
}

export function skeleton(lines = 6): HTMLElement {
  const card = document.createElement('div');
  card.className = 'card skeleton';

  for (let index = 0; index < lines; index += 1) {
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.width = 40 + ((index * 17) % 55) + '%';
    card.appendChild(bar);
  }

  return card;
}

export function stat(value: number, caption: string, tone = ''): HTMLElement {
  const card = document.createElement('div');
  card.className = 'card stat ' + tone;

  const figure = document.createElement('strong');
  figure.textContent = String(value);
  card.appendChild(figure);

  const label = document.createElement('span');
  label.textContent = caption;
  card.appendChild(label);

  return card;
}

export function state(message: string, hint: string, tone = 'muted'): HTMLElement {
  const card = document.createElement('div');
  card.className = 'card state ' + tone;
  card.appendChild(icon(tone === 'muted' ? ICONS.empty : ICONS.lock, 26));

  const title = document.createElement('p');
  title.className = 'state-title';
  title.textContent = message;
  card.appendChild(title);

  const detail = document.createElement('p');
  detail.className = 'state-hint';
  detail.textContent = hint;
  card.appendChild(detail);

  return card;
}
`;

const STYLES_CONTENT = `:root {
  --bg: #08090a;
  --panel: #101213;
  --raised: #16191a;
  --hover: #1c2021;
  --border: #23282a;
  --text: #f3f5f4;
  --muted: #7f8a83;
  --accent: #00e05e;
  --accent-soft: rgb(0 224 94 / 12%);
  --warn: #f0b429;
  --danger: #ff5f56;
  --blue: #4a9bff;
  --violet: #a780ff;
  --cyan: #2fd8d0;
  --pink: #ff72b6;
  --sans: 'Helvetica Neue', Helvetica, Arial, system-ui, sans-serif;
  --mono: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace;
  color-scheme: dark;
}

@media (prefers-color-scheme: light) {
  :root {
    --bg: #fff;
    --panel: #fafbfa;
    --raised: #fff;
    --hover: #f0f2f0;
    --border: #e3e7e3;
    --text: #08090a;
    --muted: #5f6a62;
    --accent: #00893c;
    --accent-soft: rgb(0 137 60 / 10%);
    --warn: #a86800;
    --danger: #d0342c;
    --blue: #1668d6;
    --violet: #6f42d4;
    --cyan: #00817c;
    --pink: #c8348a;
    color-scheme: light;
  }
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--sans);
  font-size: 14px;
  -webkit-font-smoothing: antialiased;
}

svg {
  flex: none;
}

.shell {
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
  min-height: 100vh;
}

/* Sidebar */

.side {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  border-right: 1px solid var(--border);
  background: var(--panel);
  padding: 1.25rem 0.875rem;
  position: sticky;
  top: 0;
  height: 100vh;
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0 0.375rem;
  color: var(--text);
  text-decoration: none;
}

.brand .mark {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 7px;
  background: var(--accent);
  color: var(--bg);
}

.brand strong {
  display: block;
  font-size: 0.9375rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  text-transform: uppercase;
  line-height: 1.1;
}

.brand span {
  display: block;
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
}

.group {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-height: 0;
}

.group > h2 {
  margin: 0 0 0.375rem;
  padding: 0 0.5rem;
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
}

.group.scrolls {
  overflow-y: auto;
}

.side a.item,
.side button.item {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  width: 100%;
  padding: 0.4375rem 0.5rem;
  border: 0;
  border-radius: 7px;
  background: none;
  color: var(--muted);
  font: inherit;
  font-weight: 500;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
}

.side .item:hover {
  background: var(--hover);
  color: var(--text);
}

.side .item[aria-current='page'] {
  background: color-mix(in srgb, var(--tint, var(--accent)) 13%, transparent);
  color: var(--tint, var(--accent));
  font-weight: 700;
}

.side .item span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.side footer {
  margin-top: auto;
  border-top: 1px solid var(--border);
  padding-top: 0.75rem;
}

.side footer code {
  display: block;
  overflow: hidden;
  margin: 0 0 0.5rem;
  padding: 0 0.5rem;
  color: var(--muted);
  font-family: var(--mono);
  font-size: 0.6875rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Top bar */

.top {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  position: sticky;
  top: 0;
  z-index: 2;
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(8px);
  padding: 0 1.5rem;
  height: 52px;
  color: var(--muted);
  font-size: 0.8125rem;
}

.top .crumb {
  color: var(--text);
  font-weight: 600;
}

.top .spacer {
  flex: 1;
}

.ghost {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--raised);
  padding: 0.3125rem 0.625rem;
  color: var(--muted);
  font: inherit;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
}

.ghost:hover {
  border-color: var(--muted);
  color: var(--text);
}

/* Page */

main {
  min-width: 0;
}

.page {
  padding: 2rem 1.5rem 4rem;
}

h1 {
  margin: 0;
  padding-left: 0.75rem;
  border-left: 4px solid var(--tint, var(--accent));
  font-size: clamp(1.75rem, 4vw, 2.375rem);
  font-weight: 800;
  letter-spacing: -0.035em;
  line-height: 0.98;
  text-transform: uppercase;
}

.lede {
  max-width: 62ch;
  margin: 0.625rem 0 0;
  color: var(--muted);
  font-size: 0.875rem;
  line-height: 1.55;
}

.route {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.875rem;
  color: var(--muted);
  font-family: var(--mono);
  font-size: 0.75rem;
}

.output {
  margin-top: 1.5rem;
}

/* Cards */

.card {
  border: 1px solid var(--border);
  border-radius: 11px;
  background: var(--panel);
  overflow: hidden;
}

.tint-0 {
  --tint: var(--accent);
}

.tint-1 {
  --tint: var(--blue);
}

.tint-2 {
  --tint: var(--violet);
}

.tint-3 {
  --tint: var(--cyan);
}

.tint-4 {
  --tint: var(--pink);
}

.tint-5 {
  --tint: var(--warn);
}

.strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 0.875rem;
  margin-bottom: 1.5rem;
}

.stat {
  padding: 1rem 1.125rem;
}

.stat strong {
  display: block;
  color: var(--tint, var(--text));
  font-size: 2rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.04em;
  line-height: 1;
}

.stat span {
  display: block;
  margin-top: 0.375rem;
  color: var(--muted);
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(310px, 1fr));
  gap: 0.875rem;
}

.grid .card {
  padding: 1rem 1.125rem 0.75rem;
  transition:
    border-color 0.15s ease,
    transform 0.15s ease;
}

.grid .card:hover {
  border-color: color-mix(in srgb, var(--tint) 55%, var(--border));
  transform: translateY(-2px);
}

.grid h2 {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  margin: 0 0 0.75rem;
  font-size: 0.9375rem;
  font-weight: 800;
  letter-spacing: -0.015em;
  text-transform: uppercase;
}

.grid h2 .chip {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--tint) 16%, transparent);
  color: var(--tint);
}

.grid .row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border-top: 1px solid var(--border);
  padding: 0.4375rem 0;
  font-family: var(--mono);
  font-size: 0.75rem;
}

.grid .row .path {
  overflow: hidden;
  color: var(--muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.grid .row .cap {
  margin-left: auto;
  color: var(--tint, var(--accent));
  font-size: 0.6875rem;
}

.grid .row .cap.none {
  color: var(--muted);
  font-style: italic;
}

/* Table */

.scroll {
  overflow-x: auto;
}

table {
  border-collapse: collapse;
  width: 100%;
}

th,
td {
  max-width: 280px;
  overflow: hidden;
  padding: 0.625rem 0.875rem;
  border-bottom: 1px solid var(--border);
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

th {
  position: sticky;
  top: 0;
  background: var(--raised);
  color: var(--muted);
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

td {
  font-size: 0.8125rem;
}

td.mono {
  font-family: var(--mono);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
}

td.nothing {
  color: var(--muted);
}

tbody tr:hover td {
  background: var(--hover);
}

tbody tr:last-child td {
  border-bottom: 0;
}

/* Pills */

.pill {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  border-radius: 999px;
  padding: 0.125rem 0.5rem;
  background: var(--hover);
  color: var(--muted);
  font-family: var(--sans);
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.pill-ok,
.pill-get {
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  color: var(--accent);
}

.pill-post {
  background: color-mix(in srgb, var(--blue) 16%, transparent);
  color: var(--blue);
}

.pill-warn,
.pill-patch {
  background: color-mix(in srgb, var(--warn) 16%, transparent);
  color: var(--warn);
}

.pill-put {
  background: color-mix(in srgb, var(--violet) 16%, transparent);
  color: var(--violet);
}

.pill-danger,
.pill-delete {
  background: color-mix(in srgb, var(--danger) 16%, transparent);
  color: var(--danger);
}

/* States */

.skeleton {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1.125rem;
}

.skeleton .bar {
  height: 11px;
  border-radius: 4px;
  background: linear-gradient(90deg, var(--hover), var(--border), var(--hover));
  background-size: 200% 100%;
  animation: sweep 1.4s ease-in-out infinite;
}

@keyframes sweep {
  from {
    background-position: 200% 0;
  }

  to {
    background-position: -60% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton .bar {
    animation: none;
  }
}

.state {
  display: grid;
  justify-items: center;
  gap: 0.375rem;
  padding: 3rem 1.5rem;
  text-align: center;
}

.state svg {
  color: var(--muted);
}

.state.denied svg {
  color: var(--warn);
}

.state-title {
  margin: 0;
  font-weight: 700;
}

.state-hint {
  max-width: 44ch;
  margin: 0;
  color: var(--muted);
  font-size: 0.8125rem;
  line-height: 1.5;
}

/* Sign in */

.centered {
  display: grid;
  place-items: center;
  min-height: 100vh;
  padding: 1.5rem;
}

.centered .card {
  width: 100%;
  max-width: 380px;
  padding: 2rem;
}

.centered h1 {
  margin-top: 1.5rem;
  font-size: 2rem;
}

form {
  display: grid;
  gap: 0.625rem;
  margin-top: 1.5rem;
}

label {
  display: grid;
  gap: 0.3125rem;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
}

input {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  padding: 0.5625rem 0.75rem;
  color: var(--text);
  font: inherit;
}

input:focus-visible {
  border-color: var(--accent);
  outline: none;
}

button.primary {
  margin-top: 0.375rem;
  border: 0;
  border-radius: 8px;
  background: var(--accent);
  padding: 0.625rem 1rem;
  color: var(--bg);
  font: inherit;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
}

button.primary:hover {
  filter: brightness(1.08);
}

.error {
  margin: 0.875rem 0 0;
  color: var(--danger);
  font-size: 0.8125rem;
}

@media (width <= 820px) {
  .shell {
    grid-template-columns: minmax(0, 1fr);
  }

  .side {
    position: static;
    height: auto;
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }

  .side .group.scrolls {
    flex-direction: row;
    overflow-x: auto;
  }

  .side .group.scrolls > h2 {
    display: none;
  }

  .page {
    padding: 1.5rem 1rem 3rem;
  }
}
`;

const SHELL_CONTENT = `---
import '../styles/admin.css';

interface Props {
  title: string;
  bare?: boolean;
}

const { title, bare = false } = Astro.props;
---

<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title} — HeryJs admin</title>
  </head>
  <body>
    {
      bare ? (
        <div class="centered">
          <slot />
        </div>
      ) : (
        <div class="shell">
          <aside class="side">
            <a class="brand" href="/">
              <span class="mark" id="brand-mark"></span>
              <span>
                <strong>HeryJs</strong>
                <span>Admin</span>
              </span>
            </a>

            <nav class="group">
              <h2>General</h2>
              <a class="item" href="/" id="overview-link"></a>
            </nav>

            <nav class="group scrolls" id="sections">
              <h2>Sections</h2>
            </nav>

            <footer>
              <code id="api-url"></code>
              <button class="item" id="sign-out" type="button"></button>
            </footer>
          </aside>

          <main>
            <header class="top">
              <span>HeryJs</span>
              <span id="crumb-icon"></span>
              <span class="crumb" id="crumb">{title}</span>
              <span class="spacer"></span>
              <span id="top-extra"></span>
            </header>

            <div class="page">
              <slot />
            </div>
          </main>
        </div>
      )
    }

    <script>
      import { API_URL, api, sectionsOf, type DescribedController } from '../lib/api';
      import { ICONS, icon, iconFor, tintOf } from '../lib/icons';
      import { clearToken, token } from '../lib/session';

      const onLogin = window.location.pathname.startsWith('/login');

      if (!token() && !onLogin) {
        window.location.href = '/login';
      }

      const label = (element: HTMLElement | null, node: typeof ICONS.overview, text: string) => {
        if (!element) {
          return;
        }

        const caption = document.createElement('span');
        caption.textContent = text;
        element.append(icon(node), caption);
      };

      document.getElementById('brand-mark')?.appendChild(icon(ICONS.brand, 16));
      document.getElementById('crumb-icon')?.appendChild(icon(ICONS.crumb, 13));
      label(document.getElementById('overview-link'), ICONS.overview, 'Overview');
      label(document.getElementById('sign-out'), ICONS.signOut, 'Sign out');

      const apiUrl = document.getElementById('api-url');

      if (apiUrl) {
        apiUrl.textContent = API_URL.replace(/^https?:\\/\\//, '');
        apiUrl.title = API_URL;
      }

      document.getElementById('sign-out')?.addEventListener('click', () => {
        clearToken();
        window.location.href = '/login';
      });

      if (token() && !onLogin) {
        const nav = document.getElementById('sections');
        const { data } = await api<DescribedController[]>('/describe');
        const current = new URLSearchParams(window.location.search).get('path');

        for (const section of sectionsOf(data)) {
          const link = document.createElement('a');
          link.className = 'item ' + tintOf(section.path);
          link.href = '/browse?path=' + encodeURIComponent(section.path);
          label(link, iconFor(section.path), section.label);

          if (section.path === current) {
            link.setAttribute('aria-current', 'page');
          }

          nav?.appendChild(link);
        }
      }
    </script>
  </body>
</html>
`;

const INDEX_CONTENT = `---
import Shell from '../layouts/Shell.astro';
---

<Shell title="Overview">
  <h1>Overview</h1>
  <p class="lede">
    Every controller the API reports, with the capability guarding each route. Resource routes
    always carry one; the technical endpoints are gated at the controller level instead.
  </p>

  <div class="output" id="output"></div>
</Shell>

<script>
  import { api, labelOf, sectionsOf, type DescribedController } from '../lib/api';
  import { icon, iconFor, tintOf } from '../lib/icons';
  import { methodBadge, skeleton, stat } from '../lib/render';

  const output = document.getElementById('output')!;
  output.appendChild(skeleton(4));

  const { data } = await api<DescribedController[]>('/describe');
  const routes = data.flatMap((controller) => controller.routes);

  const strip = document.createElement('div');
  strip.className = 'strip';
  strip.append(
    stat(data.length, 'Controllers', 'tint-1'),
    stat(routes.length, 'Routes', 'tint-2'),
    stat(routes.filter((route) => route.capability).length, 'Behind a capability', 'tint-0'),
    stat(sectionsOf(data).length, 'Browsable sections', 'tint-3'),
  );

  const grid = document.createElement('div');
  grid.className = 'grid';

  for (const controller of data) {
    const card = document.createElement('section');
    card.className = 'card ' + tintOf(controller.basePath);

    const heading = document.createElement('h2');

    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.appendChild(icon(iconFor(controller.basePath), 15));
    heading.appendChild(chip);

    const name = document.createElement('span');
    name.textContent = labelOf(controller.basePath) || 'Root';
    heading.appendChild(name);
    card.appendChild(heading);

    for (const route of controller.routes) {
      const row = document.createElement('div');
      row.className = 'row';
      row.appendChild(methodBadge(route.method));

      const path = document.createElement('span');
      path.className = 'path';
      path.textContent = controller.basePath + (route.path === '/' ? '' : route.path);
      path.title = path.textContent;
      row.appendChild(path);

      const capability = document.createElement('span');
      capability.className = route.capability ? 'cap' : 'cap none';
      capability.textContent = route.capability ?? 'no capability';
      row.appendChild(capability);

      card.appendChild(row);
    }

    grid.appendChild(card);
  }

  output.replaceChildren(strip, grid);
</script>
`;

const BROWSE_CONTENT = `---
import Shell from '../layouts/Shell.astro';
---

<Shell title="Browse">
  <h1 id="heading">Browse</h1>
  <p class="route" id="route"></p>

  <div class="output" id="output"></div>
</Shell>

<script>
  import { ApiError, api, labelOf } from '../lib/api';
  import { tintOf } from '../lib/icons';
  import { methodBadge, pill, skeleton, state, table } from '../lib/render';

  const heading = document.getElementById('heading')!;
  const output = document.getElementById('output')!;
  const route = new URLSearchParams(window.location.search).get('path');

  if (!route) {
    output.appendChild(state('No section selected', 'Pick one in the sidebar to list its rows.'));
  } else {
    const label = labelOf(route);
    heading.textContent = label;
    document.title = label + ' — HeryJs admin';
    document.body.classList.add(tintOf(route));

    const crumb = document.getElementById('crumb');

    if (crumb) {
      crumb.textContent = label;
    }

    const target = document.getElementById('route')!;
    target.appendChild(methodBadge('GET'));
    target.appendChild(document.createTextNode(route));

    output.appendChild(skeleton());

    try {
      const { data } = await api<unknown>(route);
      const rows = (Array.isArray(data) ? data : [data]) as Record<string, unknown>[];

      output.replaceChildren(
        rows.length === 0
          ? state('Nothing to show', 'This section answered with an empty collection.')
          : table(rows),
      );

      document.getElementById('top-extra')?.appendChild(
        pill(rows.length + (rows.length === 1 ? ' row' : ' rows'), 'neutral'),
      );
    } catch (error) {
      output.replaceChildren(
        error instanceof ApiError && error.status === 403
          ? state(
              'A capability denied this listing',
              'The API refused to answer for the signed-in account. Nothing is hidden client side.',
              'denied',
            )
          : state('Could not load this section', 'The request to ' + route + ' failed.', 'denied'),
      );
    }
  }
</script>
`;

const LOGIN_CONTENT = `---
import Shell from '../layouts/Shell.astro';
---

<Shell title="Sign in" bare>
  <div class="card">
    <span class="brand">
      <span class="mark" id="brand-mark"></span>
      <span>
        <strong>HeryJs</strong>
        <span>Admin</span>
      </span>
    </span>

    <h1>Sign in</h1>
    <p class="lede">Same session endpoint as the API. The token stays in this browser.</p>

    <form id="form">
      <label>
        Email
        <input id="email" type="email" required autocomplete="username" />
      </label>
      <label>
        Password
        <input id="password" type="password" required autocomplete="current-password" />
      </label>
      <button class="primary" type="submit">Sign in</button>
    </form>

    <p class="error" id="error" hidden></p>
  </div>
</Shell>

<script>
  import { API_URL } from '../lib/api';
  import { ICONS, icon } from '../lib/icons';
  import { storeToken } from '../lib/session';

  document.getElementById('brand-mark')?.appendChild(icon(ICONS.brand, 16));

  const form = document.getElementById('form') as HTMLFormElement;
  const error = document.getElementById('error')!;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    error.hidden = true;

    const email = (document.getElementById('email') as HTMLInputElement).value;
    const password = (document.getElementById('password') as HTMLInputElement).value;

    void fetch(API_URL + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Sign in failed');
        }

        const body = (await response.json()) as { data: { token: string } };
        storeToken(body.data.token);
        window.location.href = '/';
      })
      .catch(() => {
        error.hidden = false;
        error.textContent = 'Those credentials were refused.';
      });
  });
</script>
`;

const FILES: Record<string, string> = {
  'admin/package.json': PACKAGE_CONTENT,
  'admin/astro.config.mjs': ASTRO_CONFIG_CONTENT,
  'admin/tsconfig.json': TSCONFIG_CONTENT,
  'admin/eslint.config.mjs': ESLINT_CONTENT,
  'admin/src/lib/session.ts': SESSION_CONTENT,
  'admin/src/lib/api.ts': API_CONTENT,
  'admin/src/lib/icons.ts': ICONS_CONTENT,
  'admin/src/lib/render.ts': RENDER_CONTENT,
  'admin/src/styles/admin.css': STYLES_CONTENT,
  'admin/src/layouts/Shell.astro': SHELL_CONTENT,
  'admin/src/pages/index.astro': INDEX_CONTENT,
  'admin/src/pages/browse.astro': BROWSE_CONTENT,
  'admin/src/pages/login.astro': LOGIN_CONTENT,
};

function addWorkspaceMember(): void {
  if (!existsSync(WORKSPACE_FILE)) {
    return;
  }

  const current = readFileSync(WORKSPACE_FILE, 'utf8');

  if (current.includes("'admin'")) {
    return;
  }

  writeFileSync(
    WORKSPACE_FILE,
    current.replace('packages:\n', "packages:\n  - 'admin'\n"),
  );
  console.log(pc.green(`✔ patched ${WORKSPACE_FILE}`));
}

registerModule({
  name: 'admin-astro',
  description:
    'Add an admin panel built with Astro. Sections are discovered from GET /describe, so any module that ships a listable route appears without touching the admin.',
  dependencies: [],
  install() {
    for (const [filePath, content] of Object.entries(FILES)) {
      if (existsSync(filePath)) {
        console.log(pc.yellow(`${filePath} already exists, skipping.`));
        continue;
      }

      mkdirSync(path.dirname(filePath), { recursive: true });
      writeFileSync(filePath, content);
      console.log(pc.green(`✔ ${filePath}`));
    }

    addWorkspaceMember();

    console.log('');
    console.log(pc.cyan('Next steps:'));
    console.log(
      `  1. Run ${pc.bold('pnpm install')} to install the admin workspace`,
    );
    console.log(
      `  2. Run ${pc.bold('pnpm --filter admin dev')} and sign in with an account of your API`,
    );
    console.log(
      `  3. Point it elsewhere with ${pc.bold('PUBLIC_API_URL')} if the API is not on http://localhost:3000`,
    );
  },
});
