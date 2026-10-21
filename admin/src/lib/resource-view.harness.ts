import { afterEach, beforeEach, vi } from 'vitest';
import { mountResource } from './resource-view';
import type { MountOptions } from './resource-view';
import type { ResourceRow, SearchMeta } from './resource';
import { mockControllers, mockDescription, mockRow } from './resource.fixture';

export interface Call {
  route: string;
  body: Record<string, unknown>;
}

type Handler = (body: Record<string, unknown>) => unknown;

export const META: SearchMeta = {
  page: 1,
  limit: 15,
  last_page: 1,
  total: 2,
  capabilities: {
    create: { allowed: true },
    hardDelete: { allowed: true },
    listTrashed: { allowed: true },
  },
};

export const server: {
  calls: Call[];
  handlers: Record<string, Handler>;
  rows: ResourceRow[];
  meta: SearchMeta;
} = { calls: [], handlers: {}, rows: [], meta: META };

export function envelope(data: unknown, extra: Record<string, unknown> = {}) {
  return { data, messages: [], ...extra };
}

export function respond(status: number, body: unknown) {
  return Promise.resolve({
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
  });
}

export function installServer(): void {
  beforeEach(() => {
    server.calls = [];
    server.rows = [mockRow('a', 'First'), mockRow('b', 'Second')];
    server.meta = META;
    server.handlers = {};

    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        const route = url.replace('http://localhost:3000', '');
        const body = init?.body
          ? (JSON.parse(init.body as string) as Record<string, unknown>)
          : {};
        server.calls.push({ route, body });

        if (server.handlers[route]) {
          return respond(200, server.handlers[route](body));
        }

        if (route === '/blog-posts/describe') {
          return respond(200, envelope(mockDescription));
        }

        if (route === '/blog-posts/search') {
          return respond(200, envelope(server.rows, { meta: server.meta }));
        }

        return respond(404, { error: { message: 'nope' } });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.body.replaceChildren();
  });
}

export async function settle(): Promise<void> {
  for (let turn = 0; turn < 8; turn += 1) {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

export async function mount(
  overrides: Partial<MountOptions> = {},
): Promise<HTMLElement> {
  const root = document.createElement('div');
  document.body.appendChild(root);
  await mountResource(root, {
    base: '/blog-posts',
    controllers: mockControllers,
    extensions: {},
    confirm: () => true,
    ...overrides,
  });
  await settle();

  return root;
}

export function searches(): Call[] {
  return server.calls.filter((call) => call.route === '/blog-posts/search');
}

export function lastSearch(): Call {
  return searches().at(-1)!;
}

export function button(root: ParentNode, text: string): HTMLButtonElement {
  const found = [...root.querySelectorAll('button')].find((item) =>
    item.textContent?.startsWith(text),
  );

  if (!found) {
    throw new Error('no button starting with ' + text);
  }

  return found;
}

export function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
