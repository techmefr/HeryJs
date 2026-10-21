import { ApiError, api } from './api';
import type { ResourceRow } from './resource';

export interface Share {
  id: string;
  granteeType: 'user' | 'team';
  granteeId: string;
  access: 'read' | 'write';
}

export interface TeamOption {
  id: string;
  name: string;
}

export function sharesRoute(base: string, id: string): string {
  return base + '/' + encodeURIComponent(id) + '/shares';
}

export function shareRoute(base: string, id: string, shareId: string): string {
  return sharesRoute(base, id) + '/' + encodeURIComponent(shareId);
}

export function grantBody(
  granteeType: string,
  granteeId: string,
  access: string,
): { granteeType: string; granteeId: string; access: string } {
  return { granteeType, granteeId: granteeId.trim(), access };
}

export function describeShare(share: Share, teams: TeamOption[] = []): string {
  const name =
    share.granteeType === 'team'
      ? (teams.find((team) => team.id === share.granteeId)?.name ??
        share.granteeId)
      : share.granteeId;

  return (
    (share.granteeType === 'team' ? 'Team ' : 'User ') +
    name +
    ' can ' +
    (share.access === 'write' ? 'read and edit' : 'read')
  );
}

function messageOf(error: unknown): string {
  if (error instanceof ApiError) {
    return error.status === 404
      ? 'That user or team was not found in your tenant.'
      : error.status === 403
        ? 'You are not allowed to share this record.'
        : (error.serverMessage ?? error.message);
  }

  return 'Request failed';
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = '',
  className = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = className;

  return node;
}

function option(value: string, text: string): HTMLOptionElement {
  const node = element('option', text);
  node.value = value;

  return node;
}

/**
 * The share dialog of one record: who it is shared with, a revoke on each, and
 * a form to grant a user or one of the caller's teams read or write access.
 * Every value is written as text, never as markup.
 */
export async function openShares(
  root: HTMLElement,
  base: string,
  row: ResourceRow,
): Promise<void> {
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-label', 'Share record');
  dialog.appendChild(element('h2', 'Share record'));

  const list = element('div');
  const message = element('p', '', 'form-error');
  message.setAttribute('role', 'alert');
  const form = element('form', '', 'form-row');
  const close = (): void => {
    if (typeof dialog.close === 'function' && dialog.open) {
      dialog.close();
    }

    dialog.remove();
  };

  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });

  let teams: TeamOption[] = [];

  try {
    teams = (await api<TeamOption[]>('/teams')).data;
  } catch {
    teams = [];
  }

  const type = element('select');
  type.setAttribute('aria-label', 'Share with');
  type.append(option('user', 'A user'), option('team', 'A team'));

  const user = element('input');
  user.placeholder = 'User id';
  user.setAttribute('aria-label', 'User id');

  const team = element('select');
  team.setAttribute('aria-label', 'Team');
  team.hidden = true;
  team.append(...teams.map((entry) => option(entry.id, entry.name)));

  const access = element('select');
  access.setAttribute('aria-label', 'Access');
  access.append(
    option('read', 'Can read'),
    option('write', 'Can read and edit'),
  );

  type.addEventListener('change', () => {
    user.hidden = type.value === 'team';
    team.hidden = type.value !== 'team';
  });

  const grant = element('button', 'Share', 'primary');
  grant.type = 'submit';
  const done = element('button', 'Close');
  done.type = 'button';
  done.addEventListener('click', close);

  form.append(type, user, team, access, grant);

  async function draw(): Promise<void> {
    try {
      const { data } = await api<Share[]>(
        sharesRoute(base, row.id) + '/search',
        { method: 'POST', body: JSON.stringify({}) },
      );

      list.replaceChildren(
        ...(data.length === 0
          ? [element('p', 'Not shared with anyone yet.', 'form-help')]
          : data.map((share) => {
              const line = element('div');
              const revoke = element('button', 'Revoke');
              revoke.type = 'button';
              revoke.addEventListener('click', async () => {
                message.textContent = '';

                try {
                  await api(shareRoute(base, row.id, share.id), {
                    method: 'DELETE',
                  });
                  await draw();
                } catch (error) {
                  message.textContent = messageOf(error);
                }
              });
              line.append(
                element('span', describeShare(share, teams)),
                document.createTextNode(' '),
                revoke,
              );

              return line;
            })),
      );
    } catch (error) {
      list.replaceChildren();
      message.textContent = messageOf(error);
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.textContent = '';
    const grantee = type.value === 'team' ? team.value : user.value;

    if (grantee.trim() === '') {
      message.textContent = 'Choose who to share with.';
      return;
    }

    try {
      await api(sharesRoute(base, row.id), {
        method: 'POST',
        body: JSON.stringify(grantBody(type.value, grantee, access.value)),
      });
      user.value = '';
      await draw();
    } catch (error) {
      message.textContent = messageOf(error);
    }
  });

  dialog.append(list, message, form, done);
  root.querySelector('dialog')?.remove();
  root.appendChild(dialog);

  if (typeof dialog.showModal === 'function') {
    dialog.showModal();
  } else {
    dialog.setAttribute('open', '');
  }

  await draw();
}
