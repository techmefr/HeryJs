import { describe, expect, it, vi } from 'vitest';
import {
  button,
  installServer,
  lastSearch,
  mount,
  server,
  settle,
} from './resource-view.harness';
import { mockDecisions, mockRow } from './resource.fixture';

installServer();

describe('the customisation surface', () => {
  it('relabels and hides columns, and formats a value as text', async () => {
    const root = await mount({
      extensions: {
        resources: {
          '/blog-posts': {
            columns: {
              id: { hidden: true },
              title: {
                label: 'Headline',
                format: (value) => String(value).toUpperCase(),
              },
            },
          },
        },
      },
    });

    const headings = [...root.querySelectorAll('th')].map(
      (item) => item.textContent,
    );
    expect(headings.some((text) => text?.startsWith('Headline'))).toBe(true);
    expect(headings).not.toContain('id');
    expect(root.textContent).toContain('FIRST');
  });

  it('never renders a formatted value as markup', async () => {
    const root = await mount({
      extensions: {
        resources: {
          '/blog-posts': {
            columns: { title: { format: () => '<b onclick="1">x</b>' } },
          },
        },
      },
    });

    expect(root.querySelector('tbody b')).toBeNull();
  });

  it('adds a row action gated by the capability it names', async () => {
    const run = vi.fn();
    server.rows = [
      mockRow('a', 'A', { ...mockDecisions, feature: { allowed: true } }),
      mockRow('b', 'B', mockDecisions),
    ];
    const root = await mount({
      extensions: {
        resources: {
          '/blog-posts': {
            rowActions: [
              { id: 'feature', label: 'Feature', capability: 'feature', run },
            ],
          },
        },
      },
    });

    expect(lastSearch().body.capabilities).toContain('feature');
    const [first, second] = root.querySelectorAll<HTMLButtonElement>(
      '[data-action="feature"]',
    );
    expect(first!.disabled).toBe(false);
    expect(second!.disabled).toBe(true);

    first!.click();
    expect(run).toHaveBeenCalledWith(
      server.rows[0],
      expect.objectContaining({ base: '/blog-posts' }),
    );
  });

  it('can switch a feature off but the api still decides the rest', async () => {
    const root = await mount({
      extensions: {
        resources: { '/blog-posts': { disable: ['delete', 'bulk'] } },
      },
    });

    expect(root.querySelector('[data-action="delete"]')).toBeNull();
    expect(
      root.querySelector('input[type="checkbox"][aria-label^="Select"]'),
    ).toBeNull();
    expect(
      root.querySelector<HTMLButtonElement>('[data-action="edit"]')!.disabled,
    ).toBe(false);
  });

  it('warns about overrides naming fields the api no longer describes', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await mount({
      extensions: {
        resources: { '/blog-posts': { fields: { gone: { label: 'Gone' } } } },
      },
    });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('gone'));
    warn.mockRestore();
  });

  it('warns when an override hides a required field, and keeps it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const root = await mount({
      extensions: {
        resources: { '/blog-posts': { fields: { title: { hidden: true } } } },
      },
    });
    button(root, 'New').click();
    await settle();

    expect(root.querySelector('input[name="title"]')).not.toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('title'));
    warn.mockRestore();
  });
});
