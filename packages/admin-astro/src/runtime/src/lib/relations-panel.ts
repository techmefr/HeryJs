import { table } from './render';
import {
  childResourceBase,
  childSearchPath,
  idsError,
  idsOf,
  parseIds,
  relationBody,
} from './relations';
import type { RelationMode } from './relations';
import {
  failureMessages,
  isAllowed,
  mutate,
  pascalOf,
  searchResource,
} from './resource';
import type { ResourceDescription, ResourceRow } from './resource';

export interface RelationsPanelOptions {
  base: string;
  row: ResourceRow;
  description: ResourceDescription;
  childRelations: string[];
  resourceBases: string[];
  onChanged: () => Promise<ResourceRow | null>;
}

interface RelationControl {
  element: HTMLElement;
  update: (row: ResourceRow | null) => void;
}

const MODE_LABELS: Record<RelationMode, string> = {
  attach: 'Attach',
  detach: 'Detach',
  sync: 'Replace all',
};

function allowedModes(row: ResourceRow, relation: string): RelationMode[] {
  const name = pascalOf(relation);
  const canAttach = isAllowed(row.capabilities, 'attach' + name);
  const canDetach = isAllowed(row.capabilities, 'detach' + name);
  const modes: RelationMode[] = [];

  if (canAttach) {
    modes.push('attach');
  }

  if (canDetach) {
    modes.push('detach');
  }

  if (canAttach && canDetach) {
    modes.push('sync');
  }

  return modes;
}

function status(text: string, isError: boolean): HTMLElement {
  const line = document.createElement('p');
  line.className = isError ? 'form-error' : 'form-help';
  line.setAttribute('role', isError ? 'alert' : 'status');
  line.textContent = text;

  return line;
}

function attachedOf(relation: string, data: unknown): string[] {
  if (typeof data !== 'object' || data === null) {
    return [];
  }

  return idsOf((data as Record<string, unknown>)[relation]);
}

async function applyRelation(
  options: RelationsPanelOptions,
  relation: string,
  mode: RelationMode,
  ids: string[],
): Promise<{ message: string; isError: boolean }> {
  try {
    const [entry] = await mutate(
      options.base,
      'update',
      relationBody(options.row.id, relation, mode, ids),
    );

    if (!entry || entry.status === 'error') {
      return {
        message: entry?.status === 'error' ? entry.error.message : 'No answer',
        isError: true,
      };
    }

    await options.onChanged();
    const attached = attachedOf(relation, entry.data);

    return {
      message:
        'Done. ' +
        (attached.length > 0
          ? 'Now attached: ' + attached.join(', ')
          : 'Nothing is attached now.'),
      isError: false,
    };
  } catch (error) {
    return { message: failureMessages(error).join(' '), isError: true };
  }
}

function relationControl(
  options: RelationsPanelOptions,
  relation: string,
): RelationControl {
  const group = document.createElement('fieldset');
  group.className = 'relation';
  group.dataset.relation = relation;

  const legend = document.createElement('legend');
  legend.textContent = pascalOf(relation);
  group.appendChild(legend);

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Ids, separated by commas';
  input.setAttribute('aria-label', 'Ids to change on ' + relation);
  group.appendChild(input);

  const result = document.createElement('div');
  const buttons = new Map<RelationMode, HTMLButtonElement>();

  const update = (row: ResourceRow | null): void => {
    const modes = row ? allowedModes(row, relation) : [];
    input.disabled = modes.length === 0;

    for (const [mode, button] of buttons) {
      button.disabled = !modes.includes(mode);
    }
  };

  for (const mode of ['attach', 'detach', 'sync'] as const) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.mode = mode;
    button.textContent = MODE_LABELS[mode];
    buttons.set(mode, button);

    button.addEventListener('click', async () => {
      const ids = parseIds(input.value);
      const problem = idsError(ids, mode);

      if (problem) {
        result.replaceChildren(status(problem, true));
        return;
      }

      const outcome = await applyRelation(options, relation, mode, ids);
      result.replaceChildren(status(outcome.message, outcome.isError));
    });

    group.appendChild(button);
  }

  group.appendChild(result);
  update(options.row);

  return { element: group, update };
}

function childLink(base: string, id: unknown): HTMLElement {
  const link = document.createElement('a');
  link.href =
    '/resource?base=' +
    encodeURIComponent(base) +
    '&edit=' +
    encodeURIComponent(String(id));
  link.textContent = 'Edit ' + String(id);

  return link;
}

function childControl(
  options: RelationsPanelOptions,
  relation: string,
): HTMLElement {
  const group = document.createElement('fieldset');
  group.className = 'relation';
  group.dataset.child = relation;

  const legend = document.createElement('legend');
  legend.textContent = pascalOf(relation);
  group.appendChild(legend);

  const childBase = childResourceBase(
    options.description.includes[relation]?.childDelegate,
    options.resourceBases,
  );
  const holder = document.createElement('div');
  const load = document.createElement('button');
  load.type = 'button';
  load.textContent = 'Show ' + relation;

  load.addEventListener('click', async () => {
    try {
      const { rows, meta } = await searchResource(
        childSearchPath(options.base, options.row.id, relation),
        {},
      );

      if (rows.length === 0) {
        holder.replaceChildren(status('Nothing here yet.', false));
        return;
      }

      const nodes: HTMLElement[] = [table(rows)];

      if (meta.total !== undefined && meta.total > rows.length) {
        nodes.push(status(rows.length + ' of ' + meta.total + ' shown', false));
      }

      if (childBase) {
        nodes.push(...rows.map((child) => childLink(childBase, child.id)));
      }

      holder.replaceChildren(...nodes);
    } catch (error) {
      holder.replaceChildren(status(failureMessages(error).join(' '), true));
    }
  });

  group.append(load, holder);

  return group;
}

export function buildRelationsPanel(
  options: RelationsPanelOptions,
): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'relations';
  const controls: RelationControl[] = [];

  const refreshing: RelationsPanelOptions = {
    ...options,
    onChanged: async () => {
      const row = await options.onChanged();

      for (const control of controls) {
        control.update(row);
      }

      return row;
    },
  };

  for (const relation of options.description.relations) {
    const control = relationControl(refreshing, relation);
    controls.push(control);
    panel.appendChild(control.element);
  }

  for (const relation of options.childRelations) {
    panel.appendChild(childControl(options, relation));
  }

  return panel;
}
