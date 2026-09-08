import { describe, expect, it } from 'vitest';
import {
  methodBadge,
  pill,
  skeleton,
  stat,
  state,
  statusTone,
  table,
} from './render';

function cellsOf(rows: Record<string, unknown>[]): {
  headings: string[];
  rows: HTMLTableCellElement[][];
  card: HTMLElement;
} {
  const card = table(rows);
  const element = card.querySelector('table');

  if (!element) {
    throw new Error('table() returned a card with no table in it');
  }

  return {
    headings: [...element.querySelectorAll('thead th')].map(
      (heading) => heading.textContent ?? '',
    ),
    rows: [...element.querySelectorAll('tbody tr')].map((row) => [
      ...row.querySelectorAll('td'),
    ]),
    card,
  };
}

function firstCell(value: unknown, column = 'anything'): HTMLTableCellElement {
  const cell = cellsOf([{ [column]: value }]).rows[0]?.[0];

  if (!cell) {
    throw new Error('table() produced no cell to look at');
  }

  return cell;
}

describe('pills', () => {
  it('carries its text and its tone', () => {
    const element = pill('draft', 'warn');

    expect(element.tagName).toBe('SPAN');
    expect(element.textContent).toBe('draft');
    expect(element.className).toBe('pill pill-warn');
  });

  // The stylesheet keys off the lowercase verb, so an uppercase tone would
  // render an unstyled badge rather than fail.
  it('tones a method badge by the lowercase verb', () => {
    expect(methodBadge('DELETE').className).toBe('pill pill-delete');
    expect(methodBadge('DELETE').textContent).toBe('DELETE');
  });
});

// The four tones are read straight off the status class, so the boundaries are
// the whole of the logic: 399 and 400 have to land on different sides.
describe('status tones', () => {
  it('calls a server error dangerous', () => {
    expect(statusTone(500)).toBe('danger');
    expect(statusTone(503)).toBe('danger');
  });

  it('warns on a client error', () => {
    expect(statusTone(400)).toBe('warn');
    expect(statusTone(404)).toBe('warn');
    expect(statusTone(499)).toBe('warn');
  });

  it('stays neutral on a redirect', () => {
    expect(statusTone(300)).toBe('neutral');
    expect(statusTone(399)).toBe('neutral');
  });

  it('calls a success ok', () => {
    expect(statusTone(200)).toBe('ok');
    expect(statusTone(299)).toBe('ok');
  });
});

describe('the table', () => {
  it('wraps itself in a scrollable card', () => {
    expect(cellsOf([{ id: 1 }]).card.className).toBe('card scroll');
  });

  // Columns come from the payload, so a resource that hides a field simply
  // never produces a column for it -- there is no allow-list to keep in step.
  it('takes its columns from the rows it was given', () => {
    expect(cellsOf([{ id: 1, title: 'a' }]).headings).toEqual(['id', 'title']);
  });

  it('unions the columns of rows that do not agree', () => {
    expect(
      cellsOf([
        { id: 1, title: 'a' },
        { id: 2, slug: 'b' },
      ]).headings,
    ).toEqual(['id', 'title', 'slug']);
  });

  it('renders a row per record', () => {
    expect(cellsOf([{ id: 1 }, { id: 2 }]).rows).toHaveLength(2);
  });

  it('marks a field a row does not have as nothing', () => {
    const cell = cellsOf([{ id: 1, title: 'a' }, { id: 2 }]).rows[1]?.[1];

    expect(cell?.textContent).toBe('—');
    expect(cell?.className).toBe('nothing');
  });

  it('marks a null the same way as a missing field', () => {
    expect(firstCell(null).className).toBe('nothing');
    expect(firstCell(null).textContent).toBe('—');
  });

  it('badges a boolean and gives it an icon', () => {
    const yes = firstCell(true).querySelector('.pill');
    const no = firstCell(false).querySelector('.pill');

    expect(yes?.className).toBe('pill pill-ok');
    expect(no?.className).toBe('pill pill-neutral');
    expect(yes?.querySelector('svg')).not.toBeNull();
    expect(yes?.textContent).toBe('true');
  });

  it('tones a number in the status column instead of printing it plain', () => {
    const cell = firstCell(404, 'status');

    expect(cell.querySelector('.pill')?.className).toBe('pill pill-warn');
  });

  it('prints an integer as it stands', () => {
    expect(firstCell(42).textContent).toBe('42');
    expect(firstCell(42).className).toBe('mono');
  });

  // A duration or a rate would otherwise print seventeen decimals and push
  // every other column off the card.
  it('rounds a fractional number to two decimals', () => {
    expect(firstCell(3.14159).textContent).toBe('3.14');
  });

  it('prints a number outside the status column plain, tone or not', () => {
    expect(firstCell(500, 'count').textContent).toBe('500');
    expect(firstCell(500, 'count').querySelector('.pill')).toBeNull();
  });

  it('serialises a nested object rather than showing object Object', () => {
    expect(firstCell({ nested: true }).textContent).toBe('{"nested":true}');
    expect(firstCell([1, 2]).textContent).toBe('[1,2]');
  });

  it('badges a known verb in the method column', () => {
    expect(firstCell('PATCH', 'method').querySelector('.pill')?.className).toBe(
      'pill pill-patch',
    );
  });

  // Only the seven real verbs get a badge: a column called method holding
  // something else is data, not a verb, and styling it as one would be a lie.
  it('leaves an unrecognised value in the method column as text', () => {
    const cell = firstCell('TRACE', 'method');

    expect(cell.querySelector('.pill')).toBeNull();
    expect(cell.textContent).toBe('TRACE');
  });

  it('badges a verb only in the method column', () => {
    expect(firstCell('GET', 'name').querySelector('.pill')).toBeNull();
  });

  it('shortens an iso timestamp to the second', () => {
    expect(firstCell('2026-09-08T09:41:07.123Z').textContent).toBe(
      '2026-09-08 09:41:07',
    );
  });

  it('leaves a string that merely looks dateish alone', () => {
    expect(firstCell('2026-09-08').textContent).toBe('2026-09-08');
  });

  // The cell is truncated by the stylesheet, so the untouched value has to
  // stay reachable on hover or it is simply lost.
  it('keeps the full value in the title of a string cell', () => {
    expect(firstCell('2026-09-08T09:41:07.123Z').title).toBe(
      '2026-09-08T09:41:07.123Z',
    );
  });

  it('has a head and an empty body for no rows', () => {
    const { headings, rows } = cellsOf([]);

    expect(headings).toEqual([]);
    expect(rows).toEqual([]);
  });
});

describe('the skeleton', () => {
  it('draws six bars unless told otherwise', () => {
    expect(skeleton().querySelectorAll('.bar')).toHaveLength(6);
  });

  it('draws as many bars as asked', () => {
    expect(skeleton(3).querySelectorAll('.bar')).toHaveLength(3);
  });

  it('draws nothing for no lines', () => {
    expect(skeleton(0).querySelectorAll('.bar')).toHaveLength(0);
  });

  // Ragged widths are what makes it read as loading text rather than as a
  // table, so they must not all come out the same.
  it('varies the bar widths', () => {
    const widths = [...skeleton(6).querySelectorAll('.bar')].map(
      (bar) => (bar as HTMLElement).style.width,
    );

    expect(new Set(widths).size).toBeGreaterThan(1);
    widths.forEach((width) => expect(width).toMatch(/^\d+%$/));
  });
});

describe('the stat card', () => {
  it('shows the figure and its caption', () => {
    const card = stat(12, 'requests');

    expect(card.querySelector('strong')?.textContent).toBe('12');
    expect(card.querySelector('span')?.textContent).toBe('requests');
  });

  it('carries no tone unless given one', () => {
    expect(stat(12, 'requests').className).toBe('card stat ');
  });

  it('carries the tone it was given', () => {
    expect(stat(0, 'failures', 'danger').className).toBe('card stat danger');
  });
});

describe('the state card', () => {
  it('shows the message and the hint', () => {
    const card = state('Nothing here', 'Seed some rows first');

    expect(card.querySelector('.state-title')?.textContent).toBe(
      'Nothing here',
    );
    expect(card.querySelector('.state-hint')?.textContent).toBe(
      'Seed some rows first',
    );
  });

  it('is muted by default', () => {
    expect(state('a', 'b').className).toBe('card state muted');
  });

  // An empty list and a refused one look nothing alike to a reader, so the
  // icon has to change with the tone and not only the colour.
  it('draws a different icon once the tone stops being muted', () => {
    const empty = state('a', 'b').querySelector('svg')?.outerHTML;
    const denied = state('a', 'b', 'danger').querySelector('svg')?.outerHTML;

    expect(empty).toBeTruthy();
    expect(denied).toBeTruthy();
    expect(denied).not.toBe(empty);
  });
});
