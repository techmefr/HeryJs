import { writeCell } from './render';
import type { ResourceExtension } from './extensions';
import type { QueryState } from './query';
import type { ResourceRow } from './resource';

export interface RowButton {
  id: string;
  label: string;
  isAllowed: boolean;
  onClick: () => void;
}

export interface ResourceTableOptions {
  rows: ResourceRow[];
  columns: string[];
  extension: ResourceExtension;
  sortable: string[];
  sort: QueryState['sort'];
  selectable: boolean;
  selected: Set<string>;
  buttonsOf: (row: ResourceRow) => RowButton[];
  onSort: (field: string) => void;
  onToggle: (id: string, isChecked: boolean) => void;
  onToggleAll: (isChecked: boolean) => void;
}

export const DENIED_HINT = 'Your account is not allowed to do this';

const HIDDEN_KEYS = new Set(['capabilities']);

export function columnsOf(
  rows: ResourceRow[],
  extension: ResourceExtension,
): string[] {
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];

  return keys.filter(
    (key) => !HIDDEN_KEYS.has(key) && extension.columns?.[key]?.hidden !== true,
  );
}

function checkbox(label: string, isChecked: boolean): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = isChecked;
  input.setAttribute('aria-label', label);

  return input;
}

function headingOf(
  column: string,
  options: ResourceTableOptions,
): HTMLTableCellElement {
  const heading = document.createElement('th');
  const label = options.extension.columns?.[column]?.label ?? column;

  if (!options.sortable.includes(column)) {
    heading.textContent = label;
    return heading;
  }

  const isSorted = options.sort?.field === column;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sort';
  button.textContent =
    label + (isSorted ? (options.sort?.direction === 'asc' ? ' ↑' : ' ↓') : '');
  button.addEventListener('click', () => options.onSort(column));
  heading.setAttribute(
    'aria-sort',
    isSorted
      ? options.sort?.direction === 'asc'
        ? 'ascending'
        : 'descending'
      : 'none',
  );
  heading.appendChild(button);

  return heading;
}

function cellOf(
  row: ResourceRow,
  column: string,
  extension: ResourceExtension,
): HTMLTableCellElement {
  const cell = document.createElement('td');
  const format = extension.columns?.[column]?.format;

  if (format) {
    cell.className = 'mono';
    cell.textContent = format(row[column], row);
    return cell;
  }

  writeCell(cell, column, row[column]);

  return cell;
}

function actionsOf(buttons: RowButton[]): HTMLTableCellElement {
  const cell = document.createElement('td');
  cell.className = 'actions';

  for (const item of buttons) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'row-action';
    button.dataset.action = item.id;
    button.textContent = item.label;
    button.disabled = !item.isAllowed;

    if (item.isAllowed) {
      button.addEventListener('click', item.onClick);
    } else {
      button.title = DENIED_HINT;
    }

    cell.appendChild(button);
  }

  return cell;
}

export function resourceTable(options: ResourceTableOptions): HTMLElement {
  const element = document.createElement('table');
  const head = element.createTHead().insertRow();

  if (options.selectable) {
    const all = document.createElement('th');
    const input = checkbox(
      'Select every row on this page',
      options.rows.length > 0 &&
        options.rows.every((row) => options.selected.has(row.id)),
    );
    input.addEventListener('change', () => options.onToggleAll(input.checked));
    all.appendChild(input);
    head.appendChild(all);
  }

  for (const column of options.columns) {
    head.appendChild(headingOf(column, options));
  }

  head.appendChild(document.createElement('th'));

  const body = element.createTBody();

  for (const row of options.rows) {
    const line = body.insertRow();

    if (options.selectable) {
      const cell = line.insertCell();
      const input = checkbox(
        'Select row ' + row.id,
        options.selected.has(row.id),
      );
      input.addEventListener('change', () =>
        options.onToggle(row.id, input.checked),
      );
      cell.appendChild(input);
    }

    for (const column of options.columns) {
      line.appendChild(cellOf(row, column, options.extension));
    }

    line.appendChild(actionsOf(options.buttonsOf(row)));
  }

  const card = document.createElement('div');
  card.className = 'card scroll';
  card.appendChild(element);

  return card;
}
