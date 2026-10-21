import type { DescribedController } from './api';
import { MAX_BATCH_ENTRIES } from './resource';

export type RelationMode = 'attach' | 'detach' | 'sync';

const CHILD_SEARCH_PATH = /^\/:id\/([^/]+)\/search$/;
const ID_SEPARATOR = /[\s,]+/;

export function parseIds(text: string): string[] {
  return [...new Set(text.split(ID_SEPARATOR).filter((part) => part !== ''))];
}

export function idsError(ids: string[], mode: RelationMode): string | null {
  if (ids.length === 0 && mode !== 'sync') {
    return 'Give at least one id';
  }

  if (ids.length > MAX_BATCH_ENTRIES) {
    return 'At most ' + MAX_BATCH_ENTRIES + ' ids at once';
  }

  return null;
}

export function relationBody(
  id: string,
  relation: string,
  mode: RelationMode,
  ids: string[],
): Record<string, unknown> {
  return { data: [{ id, relations: { [relation]: { [mode]: ids } } }] };
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

export function idsOf(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}
