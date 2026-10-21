import { pageLabel } from './query';
import type { View } from './view-state';

export function drawPager(
  view: View,
  goTo: (page: number) => Promise<void>,
): void {
  const { meta } = view.outcome;
  const summary = document.createElement('span');
  summary.textContent = pageLabel(meta);
  const nodes: HTMLElement[] = [summary];

  if (view.description.paginated && meta.last_page !== undefined) {
    const previous = document.createElement('button');
    previous.type = 'button';
    previous.textContent = 'Previous';
    previous.disabled = view.query.page <= 1;
    previous.addEventListener('click', () => void goTo(view.query.page - 1));

    const next = document.createElement('button');
    next.type = 'button';
    next.textContent = 'Next';
    next.disabled = view.query.page >= meta.last_page;
    next.addEventListener('click', () => void goTo(view.query.page + 1));

    nodes.push(previous, next);
  }

  view.pager.replaceChildren(...nodes);
}
