import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  actionsForSection,
  actionsOf,
  bodyOf,
  formFieldsOfAction,
  pathOf,
  rowActionsForBase,
  runAdminAction,
} from './admin-actions';
import { groupedSections, sectionsOf } from './api';
import type { DescribedController } from './api';
import { columnsOf } from './render';

const controllers: DescribedController[] = [
  {
    name: 'MailController',
    basePath: '/mail',
    routes: [
      {
        method: 'GET',
        path: '/',
        handler: 'list',
        admin: {
          kind: 'section',
          id: 'mail',
          title: 'Outbox',
          icon: 'mail',
          group: 'Messaging',
          order: 1,
          columns: [{ key: 'subject', label: 'Subject' }],
        },
      },
      {
        method: 'POST',
        path: '/:id/resend',
        handler: 'resend',
        admin: {
          kind: 'action',
          id: 'mail-resend',
          title: 'Resend',
          icon: 'mail',
          section: 'mail',
          scope: 'row',
        },
      },
      {
        method: 'POST',
        path: '/purge',
        handler: 'purge',
        admin: {
          kind: 'action',
          id: 'mail-purge',
          title: 'Purge',
          icon: 'box',
          section: 'mail',
          scope: 'global',
          danger: true,
          confirm: 'Delete every sent mail?',
          fields: [
            {
              name: 'days',
              label: 'Older than',
              type: 'number',
              required: true,
            },
            { name: 'token', label: 'Token', type: 'password' },
          ],
        },
      },
    ],
  },
  {
    name: 'SeedersController',
    basePath: '/seeders',
    routes: [{ method: 'GET', path: '/', handler: 'list' }],
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('contributed sections', () => {
  it('takes title, group, order and columns from the declaration', () => {
    const [mail] = sectionsOf(controllers);

    expect(mail).toMatchObject({
      label: 'Outbox',
      group: 'Messaging',
      order: 1,
      id: 'mail',
      icon: 'mail',
    });
  });

  it('puts contributed groups first and discovered sections last', () => {
    const groups = groupedSections(sectionsOf(controllers)).map(
      (entry) => entry.group,
    );

    expect(groups).toEqual(['Messaging', 'Sections']);
  });

  it('shows declared columns first, renamed, and keeps the rest of the payload', () => {
    const columns = columnsOf(
      [{ id: 1, subject: 'Hi', extra: true }],
      [
        { key: 'subject', label: 'Subject' },
        { key: 'gone', label: 'Gone' },
      ],
    );

    expect(columns.map((column) => column.label)).toEqual([
      'Subject',
      'id',
      'extra',
    ]);
  });
});

describe('contributed actions', () => {
  const [section] = sectionsOf(controllers);
  const actions = actionsOf(controllers);

  it('finds the actions of a section by scope', () => {
    expect(
      actionsForSection(actions, section, 'row').map((a) => a.meta.id),
    ).toEqual(['mail-resend']);
    expect(
      actionsForSection(actions, section, 'global').map((a) => a.meta.id),
    ).toEqual(['mail-purge']);
  });

  it('joins a resource page to the actions of the section that lists it', () => {
    expect(
      rowActionsForBase(controllers, '/mail').map((a) => a.meta.id),
    ).toEqual(['mail-resend']);
    expect(rowActionsForBase(controllers, '/other')).toEqual([]);
  });

  it('fills :id from the row, encoded', () => {
    expect(pathOf(actions[0], { row: { id: 'a/b' } })).toBe(
      '/mail/a%2Fb/resend',
    );
  });

  it('builds the body from typed fields and adds ids to a bulk action', () => {
    const purge = actions[1];

    expect(bodyOf(purge, {}, { days: '30', token: 'x' })).toEqual({
      days: 30,
      token: 'x',
    });
    expect(
      bodyOf(
        { ...purge, meta: { ...purge.meta, scope: 'bulk' } },
        { ids: ['1'] },
        { days: '1', token: '' },
      ),
    ).toEqual({ days: 1, ids: ['1'] });
  });

  it('renders a password field as a secret', () => {
    expect(
      formFieldsOfAction(actions[1].meta.fields ?? []).map((f) => f.secret),
    ).toEqual([false, true]);
  });

  it('sends a plain action at once, with no dialog', async () => {
    const sent = vi.fn(() =>
      Promise.resolve({
        status: 200,
        ok: true,
        json: () => Promise.resolve({}),
      }),
    );
    vi.stubGlobal('fetch', sent);

    const outcome = await runAdminAction(document.body, actions[0], {
      row: { id: '7' },
    });

    expect(outcome?.ok).toBe(true);
    expect(document.querySelector('dialog')).toBeNull();
    expect(
      (sent.mock.calls[0] as unknown as [string, RequestInit])[1].method,
    ).toBe('POST');
  });

  it('asks first for a dangerous action and reports a refusal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          status: 403,
          ok: false,
          json: () => Promise.resolve({}),
        }),
      ),
    );

    const pending = runAdminAction(document.body, actions[1], {});
    const dialog = document.querySelector('dialog');

    expect(dialog?.textContent).toContain('Delete every sent mail?');
    expect(dialog?.querySelector('input[type="password"]')).not.toBeNull();

    (dialog?.querySelector('input[name="days"]') as HTMLInputElement).value =
      '5';
    dialog?.querySelector('form')?.requestSubmit();
    await vi.waitFor(() =>
      expect(document.querySelector('dialog')?.textContent).toContain(
        'not allowed',
      ),
    );

    dialog?.querySelector(
      'dialog button[type="button"], button[type="button"]',
    );
    document.querySelector('dialog')?.dispatchEvent(new Event('cancel'));

    await expect(pending).resolves.toBeNull();
  });
});
