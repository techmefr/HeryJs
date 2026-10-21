import { buildForm } from './form';
import { formFieldsOf, payloadOf, valuesOf, validate } from './form-schema';
import type { FormMode } from './form-schema';
import {
  failureMessages,
  isAllowed,
  messagesOfDetails,
  mutate,
} from './resource';
import type { BatchEntry, ResourceDescription, ResourceRow } from './resource';

export interface EditorContext {
  root: HTMLElement;
  base: string;
  description: ResourceDescription;
  refreshRow: (id: string) => Promise<ResourceRow | null>;
  onSaved: (message: string) => Promise<void>;
}

const NOTHING_CHANGED = 'Nothing changed.';

function dialogOf(title: string): {
  dialog: HTMLDialogElement;
  body: HTMLElement;
  close: () => void;
} {
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-label', title);

  const heading = document.createElement('h2');
  heading.textContent = title;
  const body = document.createElement('div');
  dialog.append(heading, body);

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

  return { dialog, body, close };
}

function present(root: HTMLElement, dialog: HTMLDialogElement): void {
  root.querySelector('dialog')?.remove();
  root.appendChild(dialog);

  if (typeof dialog.showModal === 'function') {
    dialog.showModal();
  } else {
    dialog.setAttribute('open', '');
  }
}

function failureOfEntry(entry: BatchEntry | undefined): string[] {
  if (!entry) {
    return ['The API gave no answer for this record.'];
  }

  if (entry.status === 'ok') {
    return [];
  }

  const found = messagesOfDetails(entry.error.details);

  return found.length > 0 ? found : [entry.error.message];
}

function formFor(
  context: EditorContext,
  mode: FormMode,
  row: ResourceRow | null,
  close: () => void,
): HTMLElement {
  const fields = formFieldsOf(context.description, mode);
  const initial = valuesOf(fields, row);

  const handle = buildForm({
    fields,
    initial,
    submitLabel: mode === 'create' ? 'Create' : 'Save',
    onCancel: close,
    onSubmit: async (values) => {
      handle.showFailure([]);
      const errors = validate(
        fields,
        values,
        mode === 'update' ? initial : null,
      );
      handle.showErrors(errors);

      if (Object.keys(errors).length > 0) {
        return;
      }

      const payload = payloadOf(fields, values, initial, mode);

      if (mode === 'update' && Object.keys(payload).length === 0) {
        handle.showFailure([NOTHING_CHANGED]);
        return;
      }

      handle.setBusy(true);

      try {
        const body =
          mode === 'create'
            ? { data: [payload] }
            : { data: [{ id: row?.id, ...payload }] };
        const [entry] = await mutate(context.base, mode, body);
        const failure = failureOfEntry(entry);

        if (failure.length > 0) {
          handle.showFailure(failure);
          return;
        }

        close();
        await context.onSaved(mode === 'create' ? 'Created.' : 'Saved.');
      } catch (error) {
        handle.showFailure(failureMessages(error));
      } finally {
        handle.setBusy(false);
      }
    },
  });

  return handle.element;
}

export function openCreate(context: EditorContext): void {
  const { dialog, body, close } = dialogOf('New record');
  body.appendChild(formFor(context, 'create', null, close));
  present(context.root, dialog);
}

function notAllowed(): HTMLElement {
  const line = document.createElement('p');
  line.className = 'form-error';
  line.textContent = 'Your account is not allowed to edit this record.';

  return line;
}

export async function openEdit(
  context: EditorContext,
  id: string,
): Promise<void> {
  const { dialog, body, close } = dialogOf('Edit record');
  present(context.root, dialog);

  const render = (row: ResourceRow | null): void => {
    if (!row) {
      body.replaceChildren(notAllowed());
      return;
    }

    body.replaceChildren(
      isAllowed(row.capabilities, 'update')
        ? formFor(context, 'update', row, close)
        : notAllowed(),
    );
  };

  render(await context.refreshRow(id));
}
