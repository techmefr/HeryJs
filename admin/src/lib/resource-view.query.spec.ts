import { describe, expect, it, vi } from 'vitest';
import {
  META,
  button,
  installServer,
  lastSearch,
  mount,
  searches,
  server,
  settle,
  type,
} from './resource-view.harness';

installServer();

describe('sorting, searching, filtering and paging', () => {
  it('sorts on a declared sort and cycles through descending to none', async () => {
    const root = await mount();
    const header = () =>
      [...root.querySelectorAll<HTMLButtonElement>('th button.sort')].find(
        (item) => item.textContent?.startsWith('title'),
      )!;

    header().click();
    await settle();
    expect(lastSearch().body.sorts).toEqual([
      { field: 'title', direction: 'asc' },
    ]);

    header().click();
    await settle();
    expect(lastSearch().body.sorts).toEqual([
      { field: 'title', direction: 'desc' },
    ]);

    header().click();
    await settle();
    expect(lastSearch().body.sorts).toBeUndefined();
  });

  it('does not offer a sort the contract does not declare', async () => {
    const root = await mount();
    const sortable = [...root.querySelectorAll('th button.sort')].map(
      (item) => item.textContent,
    );

    expect(sortable.some((text) => text?.startsWith('views'))).toBe(false);
  });

  it('searches after a pause and returns to the first page', async () => {
    const root = await mount();
    vi.useFakeTimers();
    const input = root.querySelector<HTMLInputElement>('input[type="search"]')!;

    type(input, 'squat');
    await vi.advanceTimersByTimeAsync(400);

    expect(lastSearch().body.search).toEqual({ q: 'squat' });
    expect(lastSearch().body.page).toBe(1);
  });

  it('sends a filter with its value converted to the field type', async () => {
    const root = await mount();
    button(root, 'Add filter').click();
    const [field, operator] =
      root.querySelectorAll<HTMLSelectElement>('.filter-row select');
    field!.value = 'views';
    field!.dispatchEvent(new Event('change'));
    operator!.value = '>=';
    operator!.dispatchEvent(new Event('change'));
    type(root.querySelector<HTMLInputElement>('.filter-row input')!, '10');

    button(root, 'Apply filters').click();
    await settle();

    expect(lastSearch().body.filters).toEqual([
      { field: 'views', operator: '>=', value: 10 },
    ]);
  });

  it('keeps an invalid filter on the page and sends nothing', async () => {
    const root = await mount();
    button(root, 'Add filter').click();
    const [field] =
      root.querySelectorAll<HTMLSelectElement>('.filter-row select');
    field!.value = 'views';
    field!.dispatchEvent(new Event('change'));
    type(root.querySelector<HTMLInputElement>('.filter-row input')!, 'abc');
    const before = searches().length;

    button(root, 'Apply filters').click();
    await settle();

    expect(searches().length).toBe(before);
    expect(
      root.querySelector('.filters .form-error:not([hidden])')?.textContent,
    ).toContain('views needs a valid number');
  });

  it('pages with the next button', async () => {
    server.meta = { ...META, last_page: 3, total: 40 };
    const root = await mount();

    button(root, 'Next').click();
    await settle();

    expect(lastSearch().body.page).toBe(2);
  });

  it('changes the page size and goes back to the first page', async () => {
    const root = await mount();
    const size = root.querySelector<HTMLSelectElement>(
      'select[aria-label="Rows per page"]',
    )!;

    size.value = '10';
    size.dispatchEvent(new Event('change'));
    await settle();

    expect(lastSearch().body.limit).toBe(10);
    expect(lastSearch().body.page).toBe(1);
  });

  it('lists the trash when the collection capability allows it', async () => {
    const root = await mount();
    const toggle = root.querySelector<HTMLInputElement>(
      '.toolbar input[type="checkbox"]',
    )!;

    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    await settle();

    expect(lastSearch().body.onlyTrashed).toBe(true);
    expect(root.querySelector('[data-action="restore"]')).not.toBeNull();
    expect(root.querySelector('[data-action="edit"]')).toBeNull();
  });

  it('does not offer the trash when the capability says no', async () => {
    server.meta = { ...META, capabilities: { create: { allowed: true } } };
    const root = await mount();

    expect(root.querySelector('.toolbar input[type="checkbox"]')).toBeNull();
  });
});
