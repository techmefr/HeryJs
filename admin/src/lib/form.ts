import type { FormField, FormValue, FormValues } from './form-schema';
import { slugify } from './slug';
import { failureMessages } from './resource';
import { renderSafeHtml } from './safe-html';

export interface FormHandle {
  element: HTMLFormElement;
  values: () => FormValues;
  showErrors: (errors: Record<string, string>) => void;
  showFailure: (messages: string[]) => void;
  setBusy: (isBusy: boolean) => void;
}

export interface FormOptions {
  fields: FormField[];
  initial: FormValues;
  submitLabel: string;
  onSubmit: (values: FormValues) => void | Promise<void>;
  onCancel: () => void;
}

const TEXT_INPUT_TYPES = {
  text: 'text',
  number: 'number',
  datetime: 'datetime-local',
  slug: 'text',
} as const;

function controlOf(
  field: FormField,
  id: string,
  value: FormValue,
): HTMLElement {
  if (field.kind === 'richtext') {
    const area = document.createElement('textarea');
    area.id = id;
    area.name = field.name;
    area.rows = 10;
    area.value = String(value);

    if (field.maxLength !== undefined) {
      area.maxLength = field.maxLength;
    }

    return area;
  }

  if (field.kind === 'select') {
    const select = document.createElement('select');
    select.id = id;
    select.append(new Option('', ''));

    for (const option of field.options ?? []) {
      select.append(new Option(option, option));
    }

    select.value = String(value);

    return select;
  }

  const input = document.createElement('input');
  input.id = id;
  input.name = field.name;

  if (field.kind === 'checkbox') {
    input.type = 'checkbox';
    input.checked = value === true;
    return input;
  }

  input.type = field.secret ? 'password' : TEXT_INPUT_TYPES[field.kind];
  input.value = String(value);

  if (field.maxLength !== undefined) {
    input.maxLength = field.maxLength;
  }

  if (field.kind === 'number') {
    input.step = field.integer ? '1' : 'any';

    if (field.minimum !== undefined) {
      input.min = String(field.minimum);
    }

    if (field.maximum !== undefined) {
      input.max = String(field.maximum);
    }
  }

  if (field.placeholder) {
    input.placeholder = field.placeholder;
  }

  return input;
}

function valueOf(field: FormField, control: HTMLElement): FormValue {
  if (control instanceof HTMLInputElement && field.kind === 'checkbox') {
    return control.checked;
  }

  return (control as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)
    .value;
}

// What the API will keep of the HTML, redrawn on every keystroke, with a
// running count against the limit. The count is on what is sent: the limit is
// checked before sanitising.
function previewOf(
  field: FormField,
  area: HTMLTextAreaElement,
  id: string,
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'form-preview';

  const count = document.createElement('p');
  count.className = 'form-help';
  count.id = id + '-count';

  const view = document.createElement('div');
  view.className = 'form-preview-body';
  view.setAttribute('aria-live', 'polite');
  view.setAttribute('aria-label', 'Preview of ' + field.label);

  const allow = field.richtext?.allow;
  const limit = field.richtext?.maxLength ?? field.maxLength;

  const refresh = (): void => {
    count.textContent =
      area.value.length +
      (limit === undefined ? '' : ' / ' + limit) +
      ' characters';

    if (allow) {
      renderSafeHtml(view, area.value, allow);
    }
  };

  area.addEventListener('input', refresh);
  refresh();
  wrapper.append(count, view);

  return wrapper;
}

interface BuiltRow {
  row: HTMLElement;
  control: HTMLElement;
  error: HTMLElement;
  suggest?: HTMLButtonElement;
}

// The slug the API would start from, offered as the placeholder of the empty
// input and as a button that fills it in. An empty slug is still the better
// choice on create: the API then numbers it when the tenant already has one.
function wireSlugSuggestion(
  input: HTMLInputElement,
  source: HTMLInputElement,
  suggest: HTMLButtonElement,
): void {
  const refresh = (): void => {
    const suggested = slugify(source.value);
    input.placeholder = suggested;
    suggest.hidden = suggested === '' || suggested === input.value;
  };

  source.addEventListener('input', refresh);
  input.addEventListener('input', refresh);
  suggest.addEventListener('click', () => {
    input.value = slugify(source.value);
    refresh();
  });
  refresh();
}

function rowOf(field: FormField, value: FormValue, index: number): BuiltRow {
  const row = document.createElement('div');
  row.className = 'form-row';

  const id = 'field-' + index + '-' + field.name;
  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = field.label + (field.required ? ' *' : '');

  const control = controlOf(field, id, value);

  if (field.readonly) {
    control.setAttribute('disabled', '');
  }

  const error = document.createElement('p');
  error.className = 'form-error';
  error.id = id + '-error';
  error.hidden = true;
  control.setAttribute('aria-describedby', error.id);

  row.append(label, control);

  let suggest: HTMLButtonElement | undefined;

  if (field.slug) {
    suggest = document.createElement('button');
    suggest.type = 'button';
    suggest.className = 'form-suggest';
    suggest.textContent = 'Use suggestion';
    suggest.hidden = true;

    if (field.readonly) {
      suggest.disabled = true;
    }

    row.appendChild(suggest);
  }

  if (field.kind === 'richtext' && control instanceof HTMLTextAreaElement) {
    row.appendChild(previewOf(field, control, id));
  }

  if (field.help) {
    const help = document.createElement('p');
    help.className = 'form-help';
    help.textContent = field.help;
    row.appendChild(help);
  }

  row.appendChild(error);

  return { row, control, error, suggest };
}

export function buildForm(options: FormOptions): FormHandle {
  const element = document.createElement('form');
  element.noValidate = true;

  const failure = document.createElement('div');
  failure.className = 'form-failure';
  failure.setAttribute('role', 'alert');
  failure.hidden = true;
  element.appendChild(failure);

  const controls = new Map<string, HTMLElement>();
  const errors = new Map<string, HTMLElement>();
  const suggestions = new Map<string, HTMLButtonElement>();

  options.fields.forEach((field, index) => {
    const built = rowOf(field, options.initial[field.name] ?? '', index);
    controls.set(field.name, built.control);
    errors.set(field.name, built.error);

    if (built.suggest) {
      suggestions.set(field.name, built.suggest);
    }

    element.appendChild(built.row);
  });

  for (const field of options.fields) {
    const input = controls.get(field.name);
    const source = field.slug ? controls.get(field.slug.source) : undefined;
    const suggest = suggestions.get(field.name);

    if (
      input instanceof HTMLInputElement &&
      source instanceof HTMLInputElement &&
      suggest
    ) {
      wireSlugSuggestion(input, source, suggest);
    }
  }

  const actions = document.createElement('div');
  actions.className = 'form-actions';

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'primary';
  submit.textContent = options.submitLabel;

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', options.onCancel);

  actions.append(submit, cancel);
  element.appendChild(actions);

  const values = (): FormValues =>
    Object.fromEntries(
      options.fields.map((field) => [
        field.name,
        valueOf(field, controls.get(field.name)!),
      ]),
    );

  const handle: FormHandle = {
    element,
    values,
    showErrors(found) {
      for (const field of options.fields) {
        const message = found[field.name];
        const target = errors.get(field.name)!;
        const control = controls.get(field.name)!;
        target.hidden = message === undefined;
        target.textContent = message ?? '';
        control.setAttribute('aria-invalid', String(message !== undefined));
      }
    },
    showFailure(messages) {
      failure.hidden = messages.length === 0;
      failure.replaceChildren(
        ...messages.map((message) => {
          const line = document.createElement('p');
          line.textContent = message;
          return line;
        }),
      );
    },
    setBusy(isBusy) {
      submit.disabled = isBusy;
      cancel.disabled = isBusy;
    },
  };

  element.addEventListener('submit', (event) => {
    event.preventDefault();
    void Promise.resolve(options.onSubmit(values())).catch((error: unknown) => {
      handle.setBusy(false);
      handle.showFailure(failureMessages(error));
    });
  });

  return handle;
}
