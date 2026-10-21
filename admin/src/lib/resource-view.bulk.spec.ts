import { describe, expect, it } from 'vitest';
import {
  META,
  envelope,
  installServer,
  mount,
  server,
  settle,
} from './resource-view.harness';
import { mockDecisions, mockRow } from './resource.fixture';

installServer();

describe('bulk actions', () => {
  function selectRows(root: HTMLElement, ids: string[]): void {
    for (const id of ids) {
      const box = root.querySelector<HTMLInputElement>(
        'input[aria-label="Select row ' + id + '"]',
      )!;
      box.checked = true;
      box.dispatchEvent(new Event('change'));
    }
  }

  it('counts only the rows the api allowed, and says how many it skips', async () => {
    server.rows = [
      mockRow('a', 'A'),
      mockRow('b', 'B', { ...mockDecisions, delete: { allowed: false } }),
      mockRow('c', 'C'),
    ];
    const root = await mount();

    selectRows(root, ['a', 'b', 'c']);

    const bulk = root.querySelector<HTMLButtonElement>('[data-bulk="delete"]')!;
    expect(bulk.textContent).toBe('Delete (2)');
    expect(bulk.title).toBe('1 selected rows are not permitted');
  });

  it('disables a bulk action nobody selected is allowed to run', async () => {
    server.rows = [
      mockRow('b', 'B', { ...mockDecisions, delete: { allowed: false } }),
    ];
    const root = await mount();

    selectRows(root, ['b']);

    expect(
      root.querySelector<HTMLButtonElement>('[data-bulk="delete"]')!.disabled,
    ).toBe(true);
  });

  it('offers permanent deletion only with the collection capability', async () => {
    server.meta = { ...META, capabilities: { create: { allowed: true } } };
    const root = await mount();

    selectRows(root, ['a']);

    expect(
      root.querySelector<HTMLButtonElement>('[data-bulk="hardDelete"]')!
        .disabled,
    ).toBe(true);
  });

  it('sends only the allowed ids and reports a partial failure without losing it', async () => {
    server.rows = [
      mockRow('a', 'A'),
      mockRow('b', 'B', { ...mockDecisions, delete: { allowed: false } }),
      mockRow('c', 'C'),
    ];
    server.handlers['/blog-posts/delete'] = () =>
      envelope([
        { index: 0, id: 'a', status: 'ok', data: null },
        {
          index: 1,
          id: 'c',
          status: 'error',
          error: { status: 403, key: 'x', message: 'Changed under you' },
        },
      ]);
    const root = await mount();

    selectRows(root, ['a', 'b', 'c']);
    root.querySelector<HTMLButtonElement>('[data-bulk="delete"]')!.click();
    await settle();

    expect(
      server.calls.find((call) => call.route === '/blog-posts/delete')?.body,
    ).toEqual({
      ids: ['a', 'c'],
    });
    const notice =
      root.querySelector('[data-slot="notice"]')?.textContent ?? '';
    expect(notice).toContain('1 deleted');
    expect(notice).toContain('c: Changed under you');
    expect(notice).toContain('1 skipped');
    expect(root.querySelector('[data-bulk="delete"]')?.textContent).toBe(
      'Delete (1)',
    );
  });

  it('sends permanent deletion as a hard delete', async () => {
    server.handlers['/blog-posts/delete'] = () =>
      envelope([{ index: 0, id: 'a', status: 'ok', data: null }]);
    const root = await mount();

    selectRows(root, ['a']);
    root.querySelector<HTMLButtonElement>('[data-bulk="hardDelete"]')!.click();
    await settle();

    expect(
      server.calls.find((call) => call.route === '/blog-posts/delete')?.body,
    ).toEqual({
      ids: ['a'],
      mode: 'hard',
    });
  });

  it('does nothing when the confirmation is declined', async () => {
    const root = await mount({ confirm: () => false });

    selectRows(root, ['a']);
    root.querySelector<HTMLButtonElement>('[data-bulk="delete"]')!.click();
    await settle();

    expect(
      server.calls.some((call) => call.route === '/blog-posts/delete'),
    ).toBe(false);
  });

  it('selects and clears every row of the page from the header', async () => {
    const root = await mount();
    const all = root.querySelector<HTMLInputElement>(
      'input[aria-label="Select every row on this page"]',
    )!;

    all.checked = true;
    all.dispatchEvent(new Event('change'));
    expect(root.querySelector('.bulk')?.textContent).toContain('2 selected');

    const again = root.querySelector<HTMLInputElement>(
      'input[aria-label="Select every row on this page"]',
    )!;
    again.checked = false;
    again.dispatchEvent(new Event('change'));
    expect(root.querySelector('.bulk')?.textContent).toBe('');
  });

  it('restores from the trash with the restore capability', async () => {
    server.handlers['/blog-posts/restore'] = () =>
      envelope([{ index: 0, id: 'a', status: 'ok', data: {} }]);
    const root = await mount();
    const toggle = root.querySelector<HTMLInputElement>(
      '.toolbar input[type="checkbox"]',
    )!;
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    await settle();

    selectRows(root, ['a']);
    root.querySelector<HTMLButtonElement>('[data-bulk="restore"]')!.click();
    await settle();

    expect(
      server.calls.find((call) => call.route === '/blog-posts/restore')?.body,
    ).toEqual({
      ids: ['a'],
    });
  });
});
