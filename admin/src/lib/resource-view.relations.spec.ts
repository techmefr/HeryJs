import { describe, expect, it } from 'vitest';
import {
  button,
  envelope,
  installServer,
  mount,
  server,
  settle,
  type,
} from './resource-view.harness';
import { mockControllers, mockDecisions, mockRow } from './resource.fixture';

installServer();

describe('relations', () => {
  async function openRelations(): Promise<HTMLElement> {
    const root = await mount();
    root.querySelector<HTMLButtonElement>('[data-action="edit"]')!.click();
    await settle();

    return root;
  }

  function serveTags(): void {
    server.handlers['/blog-posts/a/tags/members'] = () =>
      envelope([{ id: 't1', name: 'Red' }]);
    server.handlers['/blog-posts/a/tags/options'] = () =>
      envelope([
        { id: 't1', name: 'Red' },
        { id: 't2', name: 'Blue' },
      ]);
  }

  async function openWithTags(): Promise<{
    root: HTMLElement;
    tags: () => Element;
  }> {
    serveTags();
    const root = await openRelations();

    return { root, tags: () => root.querySelector('[data-relation="tags"]')! };
  }

  it('lists who is attached, with detach gated by its own decision', async () => {
    const { tags } = await openWithTags();

    expect(tags().querySelector('.related-members')?.textContent).toContain(
      'Red (t1)',
    );
    expect(
      tags().querySelector<HTMLButtonElement>('[data-mode="detach"]')!.disabled,
    ).toBe(true);
  });

  it('searches the related resource and offers only what is not attached yet', async () => {
    const { tags } = await openWithTags();

    type(tags().querySelector<HTMLInputElement>('input')!, 'blu');
    button(tags(), 'Search').click();
    await settle();

    const asked = server.calls.find(
      (call) => call.route === '/blog-posts/a/tags/options',
    );
    expect(asked?.body).toEqual({ q: 'blu' });
    const offered = [...tags().querySelectorAll('.related-options li')];
    expect(offered).toHaveLength(1);
    expect(offered[0]?.textContent).toContain('Blue (t2)');
  });

  it('attaches the picked record, then re-reads the members and the capabilities', async () => {
    const { tags } = await openWithTags();
    server.handlers['/blog-posts/update'] = () =>
      envelope([
        {
          index: 0,
          id: 'a',
          status: 'ok',
          data: { id: 'a', tags: ['t1', 't2'] },
        },
      ]);
    server.rows = [
      mockRow('a', 'First', {
        ...mockDecisions,
        attachTags: { allowed: false },
      }),
    ];

    button(tags(), 'Search').click();
    await settle();
    tags()
      .querySelector<HTMLButtonElement>('.related-options [data-related="t2"]')!
      .click();
    await settle();

    expect(
      server.calls.find((call) => call.route === '/blog-posts/update')?.body,
    ).toEqual({ data: [{ id: 'a', relations: { tags: { attach: ['t2'] } } }] });
    const members = server.calls.filter(
      (call) => call.route === '/blog-posts/a/tags/members',
    );
    expect(members).toHaveLength(2);
    expect(tags().querySelector<HTMLInputElement>('input')!.disabled).toBe(
      true,
    );
  });

  it('shows the refusal the api gave for the relation change', async () => {
    const { tags } = await openWithTags();
    server.handlers['/blog-posts/update'] = () =>
      envelope([
        {
          index: 0,
          id: 'a',
          status: 'error',
          error: { status: 400, key: 'x', message: 'Unknown tag t2' },
        },
      ]);

    button(tags(), 'Search').click();
    await settle();
    tags()
      .querySelector<HTMLButtonElement>('.related-options [data-related="t2"]')!
      .click();
    await settle();

    expect(tags().textContent).toContain('Unknown tag t2');
  });

  it('lists the rows of an own-route child and links to its resource when it has one', async () => {
    server.handlers['/blog-posts/a/notes/search'] = () =>
      envelope([{ id: 'n1', body: 'Nice' }], { meta: { total: 1 } });
    const bases = [
      ...mockControllers,
      {
        name: 'BlogPostNoteController',
        basePath: '/blog-post-notes',
        routes: [
          { method: 'POST', path: '/search', handler: 's' },
          { method: 'GET', path: '/describe', handler: 'd' },
          { method: 'POST', path: '/create', handler: 'c' },
        ],
      },
    ];
    const root = await mount({ controllers: bases });
    root.querySelector<HTMLButtonElement>('[data-action="edit"]')!.click();
    await settle();

    button(root.querySelector('[data-child="notes"]')!, 'Show notes').click();
    await settle();

    const child = root.querySelector('[data-child="notes"]')!;
    expect(child.textContent).toContain('Nice');
    expect(child.querySelector('a')?.getAttribute('href')).toBe(
      '/resource?base=%2Fblog-post-notes&edit=n1',
    );
  });
});
