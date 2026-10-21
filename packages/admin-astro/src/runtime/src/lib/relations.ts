import type { DescribedController } from './api';
import { api } from './api';
import type { ResourceRow } from './resource';

export type RelationMode = 'attach' | 'detach';

const CHILD_SEARCH_PATH = /^\/:id\/([^/]+)\/search$/;
export function relationBody(
  id: string,
  relation: string,
  mode: RelationMode,
  ids: string[],
  version: Record<string, number> = {},
): Record<string, unknown> {
  return {
    data: [{ id, ...version, relations: { [relation]: { [mode]: ids } } }],
  };
}

export function childRelationsOf(
  controllers: DescribedController[],
  base: string,
): string[] {
  const controller = controllers.find((item) => item.basePath === base);

  if (!controller) {
    return [];
  }

  return controller.routes.flatMap((route) => {
    const match =
      route.method === 'POST' ? CHILD_SEARCH_PATH.exec(route.path) : null;

    return match?.[1] ? [match[1]] : [];
  });
}

export function childSearchPath(
  base: string,
  id: string,
  relation: string,
): string {
  return base + '/' + encodeURIComponent(id) + '/' + relation + '/search';
}

function kebabOf(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function pluralsOf(singular: string): string[] {
  const plurals = [singular + 's', singular + 'es'];

  if (singular.endsWith('y')) {
    plurals.unshift(singular.slice(0, -1) + 'ies');
  }

  return plurals;
}

export function childResourceBase(
  childDelegate: string | undefined,
  bases: string[],
): string | null {
  if (!childDelegate) {
    return null;
  }

  const candidates = pluralsOf(kebabOf(childDelegate)).map(
    (name) => '/' + name,
  );

  return bases.find((base) => candidates.includes(base)) ?? null;
}

export async function fetchRelated(
  base: string,
  id: string,
  relation: string,
  kind: 'members' | 'options',
  body: { q?: string },
): Promise<ResourceRow[]> {
  const { data } = await api<ResourceRow[]>(
    base + '/' + encodeURIComponent(id) + '/' + relation + '/' + kind,
    { method: 'POST', body: JSON.stringify(body) },
  );

  return data;
}

export function labelOfRelated(related: ResourceRow): string {
  const text = Object.entries(related).find(
    ([key, value]) => key !== 'id' && typeof value === 'string' && value !== '',
  );

  return text ? String(text[1]) + ' (' + related.id + ')' : related.id;
}
