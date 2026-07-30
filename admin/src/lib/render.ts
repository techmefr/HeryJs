import { ICONS, icon } from './icons';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T/;
const HTTP_METHODS = new Set(['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD', 'OPTIONS']);

export function pill(text: string, tone: string): HTMLElement {
  const element = document.createElement('span');
  element.className = 'pill pill-' + tone;
  element.textContent = text;

  return element;
}

export function methodBadge(method: string): HTMLElement {
  return pill(method, method.toLowerCase());
}

function statusTone(status: number): string {
  if (status >= 500) {
    return 'danger';
  }

  if (status >= 400) {
    return 'warn';
  }

  return status >= 300 ? 'neutral' : 'ok';
}

function writeCell(target: HTMLTableCellElement, column: string, value: unknown): void {
  if (value === null || value === undefined) {
    target.className = 'nothing';
    target.textContent = '—';
    return;
  }

  if (typeof value === 'boolean') {
    const badge = pill(String(value), value ? 'ok' : 'neutral');
    badge.prepend(icon(value ? ICONS.yes : ICONS.no, 12));
    target.appendChild(badge);
    return;
  }

  if (typeof value === 'number') {
    if (column === 'status') {
      target.appendChild(pill(String(value), statusTone(value)));
      return;
    }

    target.className = 'mono';
    target.textContent = Number.isInteger(value) ? String(value) : value.toFixed(2);
    return;
  }

  if (typeof value === 'object') {
    target.className = 'mono';
    target.textContent = JSON.stringify(value);
    return;
  }

  const text = String(value);

  if (column === 'method' && HTTP_METHODS.has(text)) {
    target.appendChild(methodBadge(text));
    return;
  }

  target.className = 'mono';
  target.textContent = ISO_DATE.test(text) ? text.replace('T', ' ').slice(0, 19) : text;
  target.title = text;
}

export function table(rows: Record<string, unknown>[]): HTMLElement {
  // Columns come from the payload itself, so a field the resource view strips
  // never reaches this table in the first place.
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];

  const element = document.createElement('table');
  const head = element.createTHead().insertRow();

  for (const column of columns) {
    const heading = document.createElement('th');
    heading.textContent = column;
    head.appendChild(heading);
  }

  const body = element.createTBody();

  for (const row of rows) {
    const line = body.insertRow();

    for (const column of columns) {
      writeCell(line.insertCell(), column, row[column]);
    }
  }

  const card = document.createElement('div');
  card.className = 'card scroll';
  card.appendChild(element);

  return card;
}

export function skeleton(lines = 6): HTMLElement {
  const card = document.createElement('div');
  card.className = 'card skeleton';

  for (let index = 0; index < lines; index += 1) {
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.width = 40 + ((index * 17) % 55) + '%';
    card.appendChild(bar);
  }

  return card;
}

export function stat(value: number, caption: string, tone = ''): HTMLElement {
  const card = document.createElement('div');
  card.className = 'card stat ' + tone;

  const figure = document.createElement('strong');
  figure.textContent = String(value);
  card.appendChild(figure);

  const label = document.createElement('span');
  label.textContent = caption;
  card.appendChild(label);

  return card;
}

export function state(message: string, hint: string, tone = 'muted'): HTMLElement {
  const card = document.createElement('div');
  card.className = 'card state ' + tone;
  card.appendChild(icon(tone === 'muted' ? ICONS.empty : ICONS.lock, 26));

  const title = document.createElement('p');
  title.className = 'state-title';
  title.textContent = message;
  card.appendChild(title);

  const detail = document.createElement('p');
  detail.className = 'state-hint';
  detail.textContent = hint;
  card.appendChild(detail);

  return card;
}
