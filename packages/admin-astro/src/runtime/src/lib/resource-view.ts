import { ApiError } from './api';
import { initialState, nextSort, searchBody } from './query';
import type { QueryState } from './query';
import { drawPager } from './pager';
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
import type {
  ResourceDescription,
  ResourceRow,
  SearchOutcome,
} from './resource';
import { buildToolbar } from './toolbar';
import { announce, confirmed } from './view-state';
import type { MountOptions, View } from './view-state';

export type { MountOptions } from './view-state';

async function fetchPage(view: View): Promise<void> {
  view.outcome = await searchResource(
    view.options.base + '/search',
    searchBody(view.description, view.query, view.capabilityKeys),
  );
}

async function refreshRow(view: View, id: string): Promise<ResourceRow | null> {
  const body = searchBody(
    view.description,
    initialState(view.description),
    view.capabilityKeys,
  );
  const outcome = await searchResource(view.options.base + '/search', {
    ...body,
    page: undefined,
    limit: undefined,
    filters: [{ field: 'id', operator: '=', value: id }],
    onlyTrashed: view.query.trashed || undefined,
  });

  return outcome.rows.find((row) => row.id === id) ?? null;
}

function buttonsOf(view: View, row: ResourceRow): RowButton[] {
  const buttons: RowButton[] = [];
  const { query } = view;

  if (!query.trashed) {
    buttons.push({
      id: 'edit',
      label: 'Edit',
      isAllowed: isAllowed(row.capabilities, 'update'),
      onClick: () => void openEdit(editorOf(view), row.id),
    });
  }

  if (query.trashed && view.description.softDeletes) {
    buttons.push({
      id: 'restore',
      label: 'Restore',
      isAllowed: isAllowed(row.capabilities, 'restore'),
      onClick: () => void runRowChange(view, 'restore', row),
    });
  }

  if (!query.trashed) {
    buttons.push({
      id: 'delete',
      label: 'Delete',
      isAllowed: isAllowed(row.capabilities, 'delete'),
      onClick: () => void runRowChange(view, 'delete', row),
    });
  }

  return buttons;
}

async function runRowChange(
  view: View,
  kind: 'delete' | 'restore',
  row: ResourceRow,
): Promise<void> {
  const verb = kind === 'restore' ? 'Restore' : 'Delete';

  if (!confirmed(view, verb + ' this record?')) {
    return;
  }

  const entries = await mutateIds(
    view.options.base,
    kind === 'restore' ? 'restore' : 'delete',
    [row.id],
  );
  const summary = summarize(entries);
  const failure = summary.failed[0];

  announce(
    view,
    failure ? failure.message : verb + ' done.',
    failure !== undefined,
  );
  await load(view);
}

function drawTable(view: View): void {
  const { rows } = view.outcome;

  if (rows.length === 0) {
    view.table.replaceChildren(
      stateCard(
        view.query.trashed ? 'The trash is empty' : 'Nothing to show',
        view.query.search || view.query.filters.length > 0
          ? 'No record matches the current search and filters.'
          : 'This resource has no record yet.',
      ),
    );
    return;
  }

  view.table.replaceChildren(
    resourceTable({
      rows,
      columns: columnsOf(rows),
      sortable: view.description.sorts,
      sort: view.query.sort,
      buttonsOf: (row) => buttonsOf(view, row),
      onSort: (field) => {
        view.query.sort = nextSort(view.query.sort, field);
        view.query.page = 1;
        void load(view);
      },
    }),
  );
}

async function goTo(view: View, page: number): Promise<void> {
  view.query.page = page;
  await load(view);
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
  drawPager(view, (page) => goTo(view, page));
  drawHeader(view);
}

function editorOf(view: View): EditorContext {
  const { base } = view.options;

  return {
    root: view.root,
    base,
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

  let description: ResourceDescription;
  let first: SearchOutcome;
  const query = (d: ResourceDescription): QueryState => initialState(d);

  try {
    description = await describeResource(options.base);
    first = await searchResource(
      options.base + '/search',
      searchBody(
        description,
        query(description),
        capabilityKeysOf(description),
      ),
    );
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

  const view: View = {
    options,
    description,
    capabilityKeys: capabilityKeysOf(description),
    query: query(description),
    outcome: first,
    notice: document.createElement('p'),
    table: document.createElement('div'),
    pager: document.createElement('div'),
    root,
  };
  view.notice.dataset.slot = 'notice';
  view.pager.className = 'pager';

  const header = document.createElement('div');
  header.className = 'resource-head';
  const create = document.createElement('span');
  create.dataset.slot = 'create';
  header.appendChild(create);

  const toolbar = buildToolbar({
    description,
    state: view.query,
    canListTrash: isAllowed(first.meta.capabilities, 'listTrashed'),
    onChange: (patch) => {
      Object.assign(view.query, patch);
      void load(view);
    },
  });

  root.replaceChildren(header, toolbar, view.notice, view.table, view.pager);
  drawTable(view);
  drawPager(view, (page) => goTo(view, page));
  drawHeader(view);

  for (const message of first.messages) {
    announce(view, message, false);
  }

  if (options.editId) {
    await openEdit(editorOf(view), options.editId);
  }
}
