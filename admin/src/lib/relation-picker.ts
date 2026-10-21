import { fetchRelated, labelOfRelated, relationBody } from './relations';
import type { RelationMode } from './relations';
import { failureMessages, isAllowed, mutate, pascalOf } from './resource';
import type { ResourceRow } from './resource';
import type { RelationsPanelOptions } from './relations-panel';

export interface RelationControl {
  element: HTMLElement;
  update: (row: ResourceRow | null) => void;
}

export function statusLine(text: string, isError: boolean): HTMLElement {
  const line = document.createElement('p');
  line.className = isError ? 'form-error' : 'form-help';
  line.setAttribute('role', isError ? 'alert' : 'status');
  line.textContent = text;

  return line;
}

function itemOf(
  related: ResourceRow,
  action: string,
  isAllowedNow: boolean,
  run: () => void,
): HTMLElement {
  const item = document.createElement('li');
  const label = document.createElement('span');
  label.textContent = labelOfRelated(related);
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.mode = action.toLowerCase();
  button.dataset.related = related.id;
  button.textContent = action;
  button.disabled = !isAllowedNow;

  if (isAllowedNow) {
    button.addEventListener('click', run);
  }

  item.append(label, button);

  return item;
}

export function relationControl(
  options: RelationsPanelOptions,
  relation: string,
): RelationControl {
  const group = document.createElement('fieldset');
  group.className = 'relation';
  group.dataset.relation = relation;

  const legend = document.createElement('legend');
  legend.textContent = pascalOf(relation);

  const members = document.createElement('ul');
  members.className = 'related-members';
  const candidates = document.createElement('ul');
  candidates.className = 'related-options';
  const result = document.createElement('div');
  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = 'Search ' + relation + ' to attach';
  input.setAttribute('aria-label', 'Search ' + relation + ' to attach');
  const search = document.createElement('button');
  search.type = 'button';
  search.textContent = 'Search';

  let row: ResourceRow | null = options.row;
  let attached: ResourceRow[] = [];
  let found: ResourceRow[] = [];

  const can = (mode: RelationMode): boolean =>
    isAllowed(row?.capabilities, mode + pascalOf(relation));

  const change = async (
    mode: RelationMode,
    related: ResourceRow,
  ): Promise<void> => {
    try {
      const [entry] = await mutate(
        options.base,
        'update',
        relationBody(options.row.id, relation, mode, [related.id]),
      );

      if (!entry || entry.status === 'error') {
        result.replaceChildren(
          statusLine(
            entry?.status === 'error' ? entry.error.message : 'No answer',
            true,
          ),
        );
        return;
      }

      row = await options.onChanged();
      await refreshMembers();
      result.replaceChildren(statusLine('Done.', false));
    } catch (error) {
      result.replaceChildren(
        statusLine(failureMessages(error).join(' '), true),
      );
    }
  };

  const draw = (): void => {
    members.replaceChildren(
      ...attached.map((related) =>
        itemOf(
          related,
          'Detach',
          can('detach'),
          () => void change('detach', related),
        ),
      ),
    );
    const attachedIds = new Set(attached.map((item) => item.id));
    candidates.replaceChildren(
      ...found
        .filter((related) => !attachedIds.has(related.id))
        .map((related) =>
          itemOf(
            related,
            'Attach',
            can('attach'),
            () => void change('attach', related),
          ),
        ),
    );
    input.disabled = !can('attach');
    search.disabled = !can('attach');
  };

  const refreshMembers = async (): Promise<void> => {
    try {
      attached = await fetchRelated(
        options.base,
        options.row.id,
        relation,
        'members',
        {},
      );
    } catch (error) {
      result.replaceChildren(
        statusLine(failureMessages(error).join(' '), true),
      );
    }

    draw();
  };

  search.addEventListener('click', async () => {
    try {
      found = await fetchRelated(
        options.base,
        options.row.id,
        relation,
        'options',
        {
          q: input.value.trim() || undefined,
        },
      );
      result.replaceChildren(
        found.length === 0
          ? statusLine('Nothing found.', false)
          : document.createElement('span'),
      );
    } catch (error) {
      result.replaceChildren(
        statusLine(failureMessages(error).join(' '), true),
      );
    }

    draw();
  });

  group.append(legend, members, input, search, candidates, result);
  void refreshMembers();

  return {
    element: group,
    update: (fresh) => {
      row = fresh;
      draw();
    },
  };
}
