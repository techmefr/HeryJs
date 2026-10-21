import { describe, expect, it, vi } from 'vitest';
import {
  META,
  button,
  envelope,
  installServer,
  lastSearch,
  mount,
  respond,
  searches,
  server,
  settle,
  type,
} from './resource-view.harness';
import { mockDecisions, mockDescription, mockRow } from './resource.fixture';

installServer();

describe('listing a resource', () => {
  it('asks for the capabilities it will render and nothing else', async () => {
    await mount();

    expect(lastSearch().body).toEqual({
      capabilities: ['update', 'delete', 'restore', 'attachTags', 'detachTags'],
      page: 1,
      limit: 15,
    });
  });

  it('shows a row per record and hides the capabilities column', async () => {
    const root = await mount();

    expect(root.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(root.textContent).not.toContain('capabilities');
    expect(root.textContent).toContain('2 records - page 1 of 1');
  });

  it('renders a hostile value as text, never as markup', async () => {
    server.rows = [
      mockRow('a', '<img src=x onerror="window.pwned=1"><script>1</script>'),
    ];
    const root = await mount();

    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('script')).toBeNull();
    expect(root.textContent).toContain('<img src=x');
  });

  it('shows a refusal as a state card, not an empty table', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => respond(403, { error: { message: 'Forbidden' } })),
    );
    const root = await mount();

    expect(root.textContent).toContain('A capability denied this resource');
  });

  it('says so when a filter leaves nothing', async () => {
    server.rows = [];
    const root = await mount();

    expect(root.textContent).toContain('Nothing to show');
  });
});

describe('buttons follow the resolved capabilities', () => {
  it('disables what the api said no to, and enables what it allowed', async () => {
    server.rows = [
      mockRow('a', 'First'),
      mockRow('b', 'Second', { ...mockDecisions, delete: { allowed: false } }),
    ];
    const root = await mount();
    const lines = root.querySelectorAll('tbody tr');
    const deleteOf = (line: Element) =>
      line.querySelector<HTMLButtonElement>('[data-action="delete"]')!;

    expect(deleteOf(lines[0]!).disabled).toBe(false);
    expect(deleteOf(lines[1]!).disabled).toBe(true);
    expect(
      lines[1]!.querySelector<HTMLButtonElement>('[data-action="edit"]')!
        .disabled,
    ).toBe(false);
  });

  it('treats a row with no decision at all as refused', async () => {
    server.rows = [{ id: 'a', title: 'First' }];
    const root = await mount();

    expect(
      root.querySelector<HTMLButtonElement>('[data-action="edit"]')!.disabled,
    ).toBe(true);
  });

  it('disables New when the collection capability says no', async () => {
    server.meta = { ...META, capabilities: { create: { allowed: false } } };
    const root = await mount();

    expect(button(root, 'New').disabled).toBe(true);
  });

  it('sends nothing when a refused row is clicked', async () => {
    server.rows = [
      mockRow('a', 'First', { ...mockDecisions, delete: { allowed: false } }),
    ];
    const root = await mount();
    const before = server.calls.length;

    root.querySelector<HTMLButtonElement>('[data-action="delete"]')!.click();
    await settle();

    expect(server.calls.length).toBe(before);
  });
});

describe('creating a record', () => {
  it('validates before it sends anything', async () => {
    const root = await mount();
    button(root, 'New').click();
    await settle();
    const before = server.calls.length;

    button(root, 'Create').click();
    await settle();

    expect(server.calls.length).toBe(before);
    expect(root.querySelector('.form-error:not([hidden])')?.textContent).toBe(
      'Required',
    );
  });

  it('posts the typed payload, then reloads so capabilities are fresh', async () => {
    server.handlers['/blog-posts/create'] = () =>
      envelope([{ index: 0, status: 'ok', data: { id: 'c' } }]);
    const root = await mount();
    const searchesBefore = searches().length;

    button(root, 'New').click();
    await settle();
    type(root.querySelector<HTMLInputElement>('input[name="title"]')!, 'Fresh');
    type(root.querySelector<HTMLInputElement>('input[name="views"]')!, '4');
    root
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    const created = server.calls.find(
      (call) => call.route === '/blog-posts/create',
    );
    expect(created?.body).toEqual({
      data: [{ title: 'Fresh', views: 4, isPublished: false }],
    });
    expect(searches().length).toBe(searchesBefore + 1);
    expect(root.querySelector('dialog')).toBeNull();
    expect(root.textContent).toContain('Created.');
  });

  it('keeps the form open and shows what the server refused', async () => {
    server.handlers['/blog-posts/create'] = () =>
      envelope([
        {
          index: 0,
          status: 'error',
          error: {
            status: 403,
            key: 'capability.forbidden',
            message: 'Not yours',
          },
        },
      ]);
    const root = await mount();
    const searchesBefore = searches().length;

    button(root, 'New').click();
    await settle();
    type(root.querySelector<HTMLInputElement>('input[name="title"]')!, 'Fresh');
    root
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(root.querySelector('dialog')).not.toBeNull();
    expect(root.querySelector('.form-failure')?.textContent).toBe('Not yours');
    expect(searches().length).toBe(searchesBefore);
  });

  it('pins a server issue to the field it names', async () => {
    const root = await mount();
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        respond(400, {
          error: {
            message: 'Bad Request Exception',
            details: {
              formErrors: [],
              fieldErrors: { data: ['Too small'] },
              issues: [
                { path: ['data', 0, 'title'], message: 'Too small' },
                { path: ['data', 0], message: 'Check the whole record' },
              ],
            },
          },
        }),
      ),
    );

    button(root, 'New').click();
    await settle();
    type(root.querySelector<HTMLInputElement>('input[name="title"]')!, 'x');
    root
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(root.querySelector('#field-0-title-error')?.textContent).toBe(
      'Too small',
    );
    expect(root.querySelector('.form-failure')?.textContent).toBe(
      'Check the whole record',
    );
  });

  it('shows the validation report of a 400 on the form', async () => {
    const root = await mount();
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        respond(400, {
          error: {
            message: 'Bad Request Exception',
            details: { formErrors: [], fieldErrors: { data: ['Too small'] } },
          },
        }),
      ),
    );

    button(root, 'New').click();
    await settle();
    type(root.querySelector<HTMLInputElement>('input[name="title"]')!, 'Fresh');
    root
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(root.querySelector('.form-failure')?.textContent).toBe('Too small');
  });
});

describe('editing a record', () => {
  it('refetches the row for its current capabilities and sends only the change', async () => {
    server.handlers['/blog-posts/update'] = () =>
      envelope([{ index: 0, id: 'a', status: 'ok', data: { id: 'a' } }]);
    const root = await mount();

    root.querySelector<HTMLButtonElement>('[data-action="edit"]')!.click();
    await settle();

    const refresh = lastSearch();
    expect(refresh.body.filters).toEqual([
      { field: 'id', operator: '=', value: 'a' },
    ]);

    type(
      root.querySelector<HTMLInputElement>('input[name="title"]')!,
      'Renamed',
    );
    root
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    const updated = server.calls.find(
      (call) => call.route === '/blog-posts/update',
    );
    expect(updated?.body).toEqual({ data: [{ id: 'a', title: 'Renamed' }] });
  });

  it('sends the version the record was read at when the resource is versioned', async () => {
    mockDescription.versioned = { field: 'version', header: 'If-Match' };
    server.handlers['/blog-posts/update'] = () =>
      envelope([{ index: 0, id: 'a', status: 'ok', data: { id: 'a' } }]);

    try {
      const root = await mount();
      server.rows = [{ ...mockRow('a', 'First'), version: 4 }];

      root.querySelector<HTMLButtonElement>('[data-action="edit"]')!.click();
      await settle();
      type(
        root.querySelector<HTMLInputElement>('input[name="title"]')!,
        'Renamed',
      );
      root
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { cancelable: true }));
      await settle();

      const updated = server.calls.find(
        (call) => call.route === '/blog-posts/update',
      );
      expect(updated?.body).toEqual({
        data: [{ id: 'a', version: 4, title: 'Renamed' }],
      });
    } finally {
      delete mockDescription.versioned;
    }
  });

  it('refuses to open a form for a record whose update was withdrawn since the list loaded', async () => {
    const root = await mount();
    server.rows = [
      mockRow('a', 'First', { ...mockDecisions, update: { allowed: false } }),
    ];

    root.querySelector<HTMLButtonElement>('[data-action="edit"]')!.click();
    await settle();

    expect(root.querySelector('dialog form')).toBeNull();
    expect(root.querySelector('dialog')?.textContent).toContain('not allowed');
  });

  it('says nothing changed instead of posting an empty update', async () => {
    const root = await mount();

    root.querySelector<HTMLButtonElement>('[data-action="edit"]')!.click();
    await settle();
    const before = server.calls.length;
    root
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(server.calls.length).toBe(before);
    expect(root.querySelector('.form-failure')?.textContent).toBe(
      'Nothing changed.',
    );
  });

  it('opens straight on a record asked for in the address', async () => {
    const root = await mount({ editId: 'b' });

    expect(root.querySelector('dialog')).not.toBeNull();
  });
});

describe('deleting', () => {
  it('asks before deleting and reloads after', async () => {
    server.handlers['/blog-posts/delete'] = () =>
      envelope([{ index: 0, id: 'a', status: 'ok', data: null }]);
    const confirm = vi.fn(() => false);
    const root = await mount({ confirm });
    const searchesBefore = searches().length;

    root.querySelector<HTMLButtonElement>('[data-action="delete"]')!.click();
    await settle();
    expect(
      server.calls.some((call) => call.route === '/blog-posts/delete'),
    ).toBe(false);

    confirm.mockReturnValue(true);
    root.querySelector<HTMLButtonElement>('[data-action="delete"]')!.click();
    await settle();

    expect(
      server.calls.find((call) => call.route === '/blog-posts/delete')?.body,
    ).toEqual({
      ids: ['a'],
    });
    expect(searches().length).toBe(searchesBefore + 1);
  });

  it('shows the refusal when the api answers one for the record', async () => {
    server.handlers['/blog-posts/delete'] = () =>
      envelope([
        {
          index: 0,
          id: 'a',
          status: 'error',
          error: { status: 403, key: 'x', message: 'Not yours to delete' },
        },
      ]);
    const root = await mount();

    root.querySelector<HTMLButtonElement>('[data-action="delete"]')!.click();
    await settle();

    expect(root.textContent).toContain('Not yours to delete');
  });
});

describe('a resource with a workflow', () => {
  const workflow = {
    field: 'status',
    initial: 'draft',
    states: ['draft', 'published'],
    transitions: [
      { name: 'publish', from: ['draft'], to: 'published', requires: [] },
      { name: 'reopen', from: ['published'], to: 'draft', requires: [] },
    ],
  };
  const decisions = {
    ...mockDecisions,
    publish: { allowed: true, scope: 'own' },
    reopen: { allowed: false },
  };

  it('asks for the transition capabilities along with the others', async () => {
    mockDescription.workflow = workflow;

    try {
      await mount();

      expect(lastSearch().body.capabilities).toEqual([
        'update',
        'delete',
        'restore',
        'attachTags',
        'detachTags',
        'publish',
        'reopen',
      ]);
    } finally {
      delete mockDescription.workflow;
    }
  });

  it('shows a button for each transition leaving the row state, disabled when refused', async () => {
    mockDescription.workflow = workflow;
    server.rows = [
      { ...mockRow('a', 'First', decisions), status: 'draft' },
      { ...mockRow('b', 'Second', decisions), status: 'published' },
    ];

    try {
      const root = await mount();
      const lines = root.querySelectorAll('tbody tr');
      const transitionsOf = (line: Element) =>
        [
          ...line.querySelectorAll<HTMLButtonElement>(
            '[data-action^="transition-"]',
          ),
        ].map((item) => [item.dataset.action, item.disabled]);

      expect(transitionsOf(lines[0]!)).toEqual([['transition-publish', false]]);
      expect(transitionsOf(lines[1]!)).toEqual([['transition-reopen', true]]);
    } finally {
      delete mockDescription.workflow;
    }
  });

  it('posts the transition by name and reports the refusal the api gave', async () => {
    mockDescription.workflow = workflow;
    server.rows = [{ ...mockRow('a', 'First', decisions), status: 'draft' }];
    server.handlers['/blog-posts/transition'] = () =>
      envelope([
        {
          index: 0,
          id: 'a',
          status: 'error',
          error: {
            status: 409,
            key: 'blog-post.illegalTransition',
            message: 'Not from here.',
          },
        },
      ]);

    try {
      const root = await mount();

      root
        .querySelector<HTMLButtonElement>('[data-action="transition-publish"]')!
        .click();
      await settle();

      const posted = server.calls.find(
        (call) => call.route === '/blog-posts/transition',
      );
      expect(posted?.body).toEqual({
        data: [{ id: 'a', transition: 'publish' }],
      });
      expect(root.textContent).toContain('Not from here.');
    } finally {
      delete mockDescription.workflow;
    }
  });
});
