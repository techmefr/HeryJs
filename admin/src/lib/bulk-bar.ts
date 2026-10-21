import { describeOutcome, planBulk, runBulk } from './bulk';
import type { BulkKind } from './bulk';
import { announce, confirmed } from './view-state';
import type { View } from './view-state';

function bulkButton(
  view: View,
  reload: () => Promise<void>,
  kind: BulkKind,
  label: string,
  verb: string,
): HTMLButtonElement {
  const plan = planBulk(
    kind,
    view.outcome.rows,
    view.selected,
    view.outcome.meta.capabilities,
  );
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.bulk = kind;
  button.textContent = label + ' (' + plan.eligible.length + ')';
  button.disabled = plan.eligible.length === 0;

  if (plan.skipped.length > 0) {
    button.title = plan.skipped.length + ' selected rows are not permitted';
  }

  button.addEventListener('click', async () => {
    const message =
      label +
      ' ' +
      plan.eligible.length +
      ' records' +
      (plan.skipped.length > 0
        ? ' (' + plan.skipped.length + ' not permitted will be skipped)'
        : '') +
      '?';

    if (!confirmed(view, message)) {
      return;
    }

    button.disabled = true;
    const outcome = await runBulk(view.options.base, plan);
    const report = describeOutcome(verb, outcome);
    announce(view, report.message, report.isError);
    view.selected = new Set([
      ...outcome.failed.map((item) => item.id),
      ...outcome.skipped,
    ]);
    await reload();
  });

  return button;
}

export function drawBulk(view: View, reload: () => Promise<void>): void {
  if (view.selected.size === 0) {
    view.bulk.replaceChildren();
    return;
  }

  const label = document.createElement('span');
  label.textContent = view.selected.size + ' selected';
  const nodes: HTMLElement[] = [label];

  if (view.query.trashed) {
    nodes.push(bulkButton(view, reload, 'restore', 'Restore', 'restored'));
  } else {
    nodes.push(bulkButton(view, reload, 'delete', 'Delete', 'deleted'));

    if (view.description.softDeletes) {
      nodes.push(
        bulkButton(
          view,
          reload,
          'hardDelete',
          'Delete permanently',
          'deleted permanently',
        ),
      );
    }
  }

  view.bulk.replaceChildren(...nodes);
}
