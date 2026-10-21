import { table } from './render';
import { relationControl, statusLine as status } from './relation-picker';
import type { RelationControl } from './relation-picker';
import { childResourceBase, childSearchPath } from './relations';
import { failureMessages, pascalOf, searchResource } from './resource';
import type { ResourceDescription, ResourceRow } from './resource';

export interface RelationsPanelOptions {
  base: string;
  row: ResourceRow;
  description: ResourceDescription;
  childRelations: string[];
  resourceBases: string[];
  onChanged: () => Promise<ResourceRow | null>;
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
