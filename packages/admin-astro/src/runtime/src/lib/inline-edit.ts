import type { FormField, FormValue } from './form-schema';

export interface InlineEdit {
  fields: Map<string, FormField>;
  canEdit: (row: { id: string; capabilities?: unknown }) => boolean;
  // Resolves to a message when the change was refused, to null when it was kept.
  commit: (
    row: { id: string },
    field: FormField,
    value: FormValue,
  ) => Promise<string | null>;
}

function controlOf(field: FormField, current: FormValue): HTMLElement {
  if (field.kind === 'select') {
    const select = document.createElement('select');
    select.append(new Option('', ''));

    for (const option of field.options ?? []) {
      select.append(new Option(option, option));
    }

    select.value = String(current);

    return select;
  }

  const input = document.createElement('input');

  if (field.kind === 'checkbox') {
    input.type = 'checkbox';
    input.checked = current === true;

    return input;
  }

  input.type = field.kind === 'number' ? 'number' : 'text';
  input.value = String(current);

  if (field.kind === 'number') {
    input.step = field.integer ? '1' : 'any';
  }

  return input;
}

function valueOf(control: HTMLElement): FormValue {
  if (control instanceof HTMLInputElement && control.type === 'checkbox') {
    return control.checked;
  }

  return (control as HTMLInputElement | HTMLSelectElement).value;
}

/**
 * Adds an "Edit <column>" button to a cell. It opens one control in place:
 * Enter keeps the change, Escape or leaving the cell drops it. The server's
 * answer decides -- a refusal stays in the cell, next to the value that
 * caused it -- so the table never shows a value the API did not accept.
 */
export function attachInlineEdit(
  cell: HTMLTableCellElement,
  row: { id: string },
  field: FormField,
  current: FormValue,
  commit: InlineEdit['commit'],
): void {
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'inline-edit';
  trigger.textContent = 'Edit';
  trigger.setAttribute('aria-label', 'Edit ' + field.label + ' of ' + row.id);
  cell.appendChild(trigger);

  trigger.addEventListener('click', () => {
    const original = [...cell.childNodes];
    const control = controlOf(field, current);
    control.setAttribute('aria-label', field.label);
    const message = document.createElement('span');
    message.className = 'inline-error';
    message.setAttribute('role', 'alert');
    let busy = false;

    const stop = (): void => cell.replaceChildren(...original);

    control.addEventListener('keydown', (event) => {
      const key = (event as KeyboardEvent).key;

      if (key === 'Escape') {
        stop();
      }

      if (key === 'Enter' && !busy) {
        event.preventDefault();
        busy = true;
        void commit(row, field, valueOf(control)).then((failure) => {
          busy = false;

          if (failure !== null) {
            message.textContent = failure;
          }
        });
      }
    });
    control.addEventListener('blur', () => {
      if (!busy && message.textContent === '') {
        stop();
      }
    });

    cell.replaceChildren(control, message);
    control.focus();
  });
}
