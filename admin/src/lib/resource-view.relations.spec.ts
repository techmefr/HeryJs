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

  it('enables attach and not detach from the record capabilities', async () => {
    const root = await openRelations();
    const tags = root.querySelector('[data-relation="tags"]')!;

    expect(
      tags.querySelector<HTMLButtonElement>('[data-mode="attach"]')!.disabled,
    ).toBe(false);
    expect(
      tags.querySelector<HTMLButtonElement>('[data-mode="detach"]')!.disabled,
    ).toBe(true);
    expect(
      tags.querySelector<HTMLButtonElement>('[data-mode="sync"]')!.disabled,
    ).toBe(true);
  });

  it('attaches the ids it was given and shows the resulting set', async () => {
    server.handlers['/blog-posts/update'] = () =>
      envelope([
        {
          index: 0,
          id: 'a',
          status: 'ok',
          data: { id: 'a', tags: ['t1', 't2'] },
        },
      ]);
    const root = await openRelations();
    const tags = root.querySelector('[data-relation="tags"]')!;

    type(tags.querySelector<HTMLInputElement>('input')!, 't1, t2 t1');
    tags.querySelector<HTMLButtonElement>('[data-mode="attach"]')!.click();
    await settle();

    expect(
      server.calls.find((call) => call.route === '/blog-posts/update')?.body,
    ).toEqual({
      data: [{ id: 'a', relations: { tags: { attach: ['t1', 't2'] } } }],
    });
    expect(root.querySelector('[data-relation="tags"]')?.textContent).toContain(
      'Now attached: t1, t2',
    );
  });

  it('refreshes the capabilities after a change instead of trusting the old ones', async () => {
    server.handlers['/blog-posts/update'] = () =>
      envelope([
        { index: 0, id: 'a', status: 'ok', data: { id: 'a', tags: [] } },
      ]);
    const root = await openRelations();
    server.rows = [
      mockRow('a', 'First', {
        ...mockDecisions,
        attachTags: { allowed: false },
      }),
    ];
    const tags = () => root.querySelector('[data-relation="tags"]')!;

    type(tags().querySelector<HTMLInputElement>('input')!, 't1');
    tags().querySelector<HTMLButtonElement>('[data-mode="attach"]')!.click();
    await settle();

    expect(
      tags().querySelector<HTMLButtonElement>('[data-mode="attach"]')!.disabled,
    ).toBe(true);
  });

  it('asks for at least one id before attaching', async () => {
    const root = await openRelations();
    const tags = root.querySelector('[data-relation="tags"]')!;
    const before = server.calls.length;

    tags.querySelector<HTMLButtonElement>('[data-mode="attach"]')!.click();
    await settle();

    expect(server.calls.length).toBe(before);
    expect(tags.textContent).toContain('Give at least one id');
  });

  it('shows the refusal the api gave for the relation change', async () => {
    server.handlers['/blog-posts/update'] = () =>
      envelope([
        {
          index: 0,
          id: 'a',
          status: 'error',
          error: { status: 400, key: 'x', message: 'Unknown tag t9' },
        },
      ]);
    const root = await openRelations();
    const tags = root.querySelector('[data-relation="tags"]')!;

    type(tags.querySelector<HTMLInputElement>('input')!, 't9');
    tags.querySelector<HTMLButtonElement>('[data-mode="attach"]')!.click();
    await settle();

    expect(tags.textContent).toContain('Unknown tag t9');
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
