import { writeCell } from './render';
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
  buttonsOf: (row: ResourceRow) => RowButton[];
}

export const DENIED_HINT = 'Your account is not allowed to do this';

const HIDDEN_KEYS = new Set(['capabilities']);

export function columnsOf(rows: ResourceRow[]): string[] {
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];

  return keys.filter((key) => !HIDDEN_KEYS.has(key));
}

function cellOf(row: ResourceRow, column: string): HTMLTableCellElement {
  const cell = document.createElement('td');
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

  for (const column of options.columns) {
    const heading = document.createElement('th');
    heading.textContent = column;
    head.appendChild(heading);
  }

  head.appendChild(document.createElement('th'));

  const body = element.createTBody();

  for (const row of options.rows) {
    const line = body.insertRow();

    for (const column of options.columns) {
      line.appendChild(cellOf(row, column));
    }

    line.appendChild(actionsOf(options.buttonsOf(row)));
  }

  const card = document.createElement('div');
  card.className = 'card scroll';
  card.appendChild(element);

  return card;
}
