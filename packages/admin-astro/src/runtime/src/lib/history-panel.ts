import { api } from './api';
import { failureMessages, isAllowed, versionPartOf } from './resource';
import type { ResourceDescription, ResourceRow } from './resource';

export interface HistoryEntry {
  id: string;
  operation: string;
  userId: string | null;
  createdAt: string;
  snapshot: Record<string, unknown>;
}

export interface HistoryChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface HistoryContext {
  root: HTMLElement;
  base: string;
  description: ResourceDescription;
  row: ResourceRow;
  onRestored: () => Promise<void>;
}

export function renderValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value ?? null);
}

export function historyPath(base: string, id: string, suffix = ''): string {
  return `${base}/${encodeURIComponent(id)}/history${suffix}`;
}

function post<T>(path: string, body: Record<string, unknown>) {
  return api<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

function button(label: string, onClick: () => void, isAllowed = true) {
  const item = document.createElement('button');
  item.type = 'button';
  item.textContent = label;
  item.disabled = !isAllowed;
  item.addEventListener('click', onClick);

  return item;
}

export async function openHistory(context: HistoryContext): Promise<void> {
  const { base, row, description } = context;
  const panel = document.createElement('div');
  panel.className = 'card history-panel';
  panel.dataset.slot = 'history';
  const notice = document.createElement('p');
  const list = document.createElement('ul');
  const close = button('Close', () => panel.remove());
  panel.append(close, notice, list);
  context.root.prepend(panel);

  const say = (text: string): void => {
    notice.textContent = text;
  };

  const showDiff = async (entry: HistoryEntry): Promise<void> => {
    try {
      const { data } = await post<{ changes: HistoryChange[] }>(
        historyPath(base, row.id, '/diff'),
        { from: entry.id },
      );
      say(
        data.changes.length === 0
          ? 'Identical to the current record.'
          : data.changes
              .map(
                (change) =>
                  `${change.field}: ${renderValue(change.before)} -> ${renderValue(change.after)}`,
              )
              .join('; '),
      );
    } catch (error) {
      say(failureMessages(error).join(' '));
    }
  };

  const restore = async (entry: HistoryEntry): Promise<void> => {
    try {
      const fresh = await post<ResourceRow[]>(`${base}/search`, {
        filters: [{ field: 'id', operator: '=', value: row.id }],
      });
      const current = fresh.data[0] ?? row;
      await post(historyPath(base, row.id, '/restore'), {
        snapshotId: entry.id,
        ...versionPartOf(description, current),
      });
      say('Restored.');
      await context.onRestored();
    } catch (error) {
      say(failureMessages(error).join(' '));
    }
  };

  try {
    const { data } = await post<HistoryEntry[]>(historyPath(base, row.id), {});
    const canRevert = isAllowed(row.capabilities, 'revert');

    for (const entry of data) {
      const item = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = `${entry.createdAt} ${entry.operation} ${renderValue(entry.snapshot)} `;
      item.append(
        label,
        button('Diff', () => void showDiff(entry)),
        button('Restore', () => void restore(entry), canRevert),
      );
      list.appendChild(item);
    }
  } catch (error) {
    say(failureMessages(error).join(' '));
  }
}
