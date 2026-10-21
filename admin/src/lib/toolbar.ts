import { clausesOf, isSearchable, operatorsFor } from './query';
import type { FilterRow, QueryState } from './query';
import type { ResourceDescription } from './resource';

export interface ToolbarOptions {
  description: ResourceDescription;
  state: QueryState;
  canListTrash: boolean;
  onChange: (patch: Partial<QueryState>) => void;
  debounceMs?: number;
}

const DEFAULT_DEBOUNCE_MS = 300;

function select(
  label: string,
  values: string[],
  current: string,
): HTMLSelectElement {
  const element = document.createElement('select');
  element.setAttribute('aria-label', label);

  for (const value of values) {
    element.append(new Option(value, value));
  }

  element.value = current;

  return element;
}

function filterLine(
  options: ToolbarOptions,
  row: FilterRow,
  onRemove: () => void,
): HTMLElement {
  const line = document.createElement('div');
  line.className = 'filter-row';

  const field = select('Filter field', options.description.filters, row.field);
  const operator = select(
    'Filter operator',
    operatorsFor(options.description, row.field),
    row.operator,
  );
  const value = document.createElement('input');
  value.setAttribute('aria-label', 'Filter value');
  value.value = row.value;

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'Remove';
  remove.addEventListener('click', onRemove);

  field.addEventListener('change', () => {
    row.field = field.value;
    const operators = operatorsFor(options.description, row.field);
    operator.replaceChildren(
      ...operators.map((name) => new Option(name, name)),
    );
    row.operator = operators[0] ?? '=';
    operator.value = row.operator;
  });
  operator.addEventListener('change', () => {
    row.operator = operator.value;
  });
  value.addEventListener('input', () => {
    row.value = value.value;
  });

  line.append(field, operator, value, remove);

  return line;
}

function newFilter(options: ToolbarOptions): FilterRow {
  const field = options.description.filters[0] ?? 'id';

  return {
    field,
    operator: operatorsFor(options.description, field)[0] ?? '=',
    value: '',
  };
}

function searchBox(options: ToolbarOptions): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = 'Search';
  input.setAttribute('aria-label', 'Search');
  input.value = options.state.search;
  let timer: ReturnType<typeof setTimeout> | undefined;

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(
      () => options.onChange({ search: input.value, page: 1 }),
      options.debounceMs ?? DEFAULT_DEBOUNCE_MS,
    );
  });

  return input;
}

function filterPanel(options: ToolbarOptions): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'filters';
  const rows: FilterRow[] = options.state.filters.map((row) => ({ ...row }));
  const list = document.createElement('div');
  const problems = document.createElement('p');
  problems.className = 'form-error';
  problems.setAttribute('role', 'alert');
  problems.hidden = true;

  const draw = (): void => {
    list.replaceChildren(
      ...rows.map((row) =>
        filterLine(options, row, () => {
          rows.splice(rows.indexOf(row), 1);
          draw();
        }),
      ),
    );
  };

  const add = document.createElement('button');
  add.type = 'button';
  add.textContent = 'Add filter';
  add.disabled = options.description.filters.length === 0;
  add.addEventListener('click', () => {
    rows.push(newFilter(options));
    draw();
  });

  const apply = document.createElement('button');
  apply.type = 'button';
  apply.textContent = 'Apply filters';
  apply.addEventListener('click', () => {
    const found = clausesOf(options.description, rows).problems;
    problems.hidden = found.length === 0;
    problems.textContent = found.join('. ');

    if (found.length === 0) {
      options.onChange({ filters: rows.map((row) => ({ ...row })), page: 1 });
    }
  });

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.textContent = 'Clear';
  clear.addEventListener('click', () => {
    rows.length = 0;
    problems.hidden = true;
    draw();
    options.onChange({ filters: [], page: 1 });
  });

  draw();
  panel.append(list, add, apply, clear, problems);

  return panel;
}

function trashToggle(options: ToolbarOptions): HTMLElement {
  const label = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = options.state.trashed;
  input.addEventListener('change', () =>
    options.onChange({ trashed: input.checked, page: 1 }),
  );
  label.append(input, document.createTextNode(' Show trash'));

  return label;
}

function pageSize(options: ToolbarOptions): HTMLElement | null {
  const limits = options.description.limits;

  if (!options.description.paginated || !limits || limits.length === 0) {
    return null;
  }

  const element = select(
    'Rows per page',
    limits.map(String),
    String(
      options.state.limit ?? options.description.defaultLimit ?? limits[0],
    ),
  );
  element.addEventListener('change', () =>
    options.onChange({ limit: Number(element.value), page: 1 }),
  );

  return element;
}

export function buildToolbar(options: ToolbarOptions): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'toolbar';

  if (isSearchable(options.description)) {
    bar.appendChild(searchBox(options));
  }

  const size = pageSize(options);

  if (size) {
    bar.appendChild(size);
  }

  if (options.description.softDeletes && options.canListTrash) {
    bar.appendChild(trashToggle(options));
  }

  if (options.description.filters.length > 0) {
    bar.appendChild(filterPanel(options));
  }

  return bar;
}
