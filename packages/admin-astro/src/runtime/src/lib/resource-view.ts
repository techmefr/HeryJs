import { ApiError } from './api';
import { state as stateCard, skeleton } from './render';
import { openCreate, openEdit } from './resource-editor';
import type { EditorContext } from './resource-editor';
import { resourceTable, columnsOf } from './resource-table';
import type { RowButton } from './resource-table';
import {
  capabilityKeysOf,
  describeResource,
  isAllowed,
  mutateIds,
  searchResource,
  summarize,
} from './resource';
import type { ResourceRow } from './resource';
import { announce, confirmed } from './view-state';
import type { MountOptions, View } from './view-state';

export type { MountOptions } from './view-state';

async function fetchPage(view: View): Promise<void> {
  view.outcome = await searchResource(view.options.base + '/search', {
    capabilities: view.capabilityKeys,
  });
}

async function refreshRow(view: View, id: string): Promise<ResourceRow | null> {
  const outcome = await searchResource(view.options.base + '/search', {
    capabilities: view.capabilityKeys,
    filters: [{ field: 'id', operator: '=', value: id }],
  });

  return outcome.rows.find((row) => row.id === id) ?? null;
}

function buttonsOf(view: View, row: ResourceRow): RowButton[] {
  return [
    {
      id: 'edit',
      label: 'Edit',
      isAllowed: isAllowed(row.capabilities, 'update'),
      onClick: () => void openEdit(editorOf(view), row.id),
    },
    {
      id: 'delete',
      label: 'Delete',
      isAllowed: isAllowed(row.capabilities, 'delete'),
      onClick: () => void deleteRow(view, row),
    },
  ];
}

async function deleteRow(view: View, row: ResourceRow): Promise<void> {
  if (!confirmed(view, 'Delete this record?')) {
    return;
  }

  const entries = await mutateIds(view.options.base, 'delete', [row.id]);
  const failure = summarize(entries).failed[0];

  announce(
    view,
    failure ? failure.message : 'Delete done.',
    failure !== undefined,
  );
  await load(view);
}

function drawTable(view: View): void {
  const { rows } = view.outcome;

  if (rows.length === 0) {
    view.table.replaceChildren(
      stateCard('Nothing to show', 'This resource has no record yet.'),
    );
    return;
  }

  view.table.replaceChildren(
    resourceTable({
      rows,
      columns: columnsOf(rows),
      buttonsOf: (row) => buttonsOf(view, row),
    }),
  );
}

async function load(view: View): Promise<void> {
  try {
    await fetchPage(view);
  } catch (error) {
    announce(
      view,
      error instanceof ApiError && error.status === 403
        ? 'The API refused this listing for your account.'
        : 'Could not load this resource.',
      true,
    );
    return;
  }

  drawTable(view);
  drawHeader(view);
}

function editorOf(view: View): EditorContext {
  return {
    root: view.root,
    base: view.options.base,
    description: view.description,
    refreshRow: (id) => refreshRow(view, id),
    onSaved: async (message) => {
      announce(view, message, false);
      await load(view);
    },
  };
}

function drawHeader(view: View): void {
  const slot = view.root.querySelector('[data-slot="create"]');

  if (!slot) {
    return;
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'primary';
  button.textContent = 'New';
  button.disabled = !isAllowed(view.outcome.meta.capabilities, 'create');

  if (button.disabled) {
    button.title = 'Your account is not allowed to do this';
  } else {
    button.addEventListener('click', () => openCreate(editorOf(view)));
  }

  slot.replaceChildren(button);
}

export async function mountResource(
  root: HTMLElement,
  options: MountOptions,
): Promise<void> {
  root.replaceChildren(skeleton());

  let view: View;

  try {
    const description = await describeResource(options.base);
    const capabilityKeys = capabilityKeysOf(description);
    const outcome = await searchResource(options.base + '/search', {
      capabilities: capabilityKeys,
    });
    view = {
      options,
      description,
      capabilityKeys,
      outcome,
      notice: document.createElement('p'),
      table: document.createElement('div'),
      root,
    };
  } catch (error) {
    root.replaceChildren(
      error instanceof ApiError && error.status === 403
        ? stateCard(
            'A capability denied this resource',
            'The API refused to answer for the signed-in account. Nothing is hidden client side.',
            'denied',
          )
        : stateCard(
            'Could not load this resource',
            'The request to ' + options.base + ' failed.',
            'denied',
          ),
    );
    return;
  }

  view.notice.dataset.slot = 'notice';

  const header = document.createElement('div');
  header.className = 'resource-head';
  const create = document.createElement('span');
  create.dataset.slot = 'create';
  header.appendChild(create);

  root.replaceChildren(header, view.notice, view.table);
  drawTable(view);
  drawHeader(view);

  for (const message of view.outcome.messages) {
    announce(view, message, false);
  }

  if (options.editId) {
    await openEdit(editorOf(view), options.editId);
  }
}
